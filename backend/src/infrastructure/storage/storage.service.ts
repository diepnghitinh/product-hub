import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  GetBucketCorsCommand,
  GetBucketLifecycleConfigurationCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type BucketLocationConstraint,
  type CORSRule,
  type LifecycleRule,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BlobServiceClient } from '@azure/storage-blob';
import { v4 as uuid } from 'uuid';
import {
  CloudStorageConfig,
  StorageProvider,
} from '@application/app-settings/domain/storage.types';
import {
  IStorageService,
  MultipartRef,
  MultipartUpload,
  PresignInput,
  PresignedUpload,
  UploadFileInput,
  UploadedMedia,
} from '@application/storage/storage.port';
import {
  MULTIPART_MAX_PARTS,
  MULTIPART_PART_SIZE_BYTES,
} from '@application/storage/use-cases/upload-policy';

/**
 * How long a browser has to spend an upload URL. Generous enough for a 200MB
 * video on a slow line (the clock runs from the signature, not from the last
 * byte), short enough that a URL scraped from devtools is dead by morning.
 */
const PRESIGN_TTL_SECONDS = 60 * 60;

/**
 * The CORS rule a direct browser upload needs. `*` origins is not the hole it
 * looks like: the *signature* is the authorization, and anyone holding a signed
 * URL could already `curl` it from anywhere. What the rule actually unlocks is
 * the browser's preflight, which otherwise blocks the PUT before it is sent.
 */
export const BROWSER_UPLOAD_CORS: CORSRule = {
  AllowedMethods: ['PUT', 'GET', 'HEAD'],
  AllowedOrigins: ['*'],
  AllowedHeaders: ['*'],
  // Not cosmetic: a multipart upload is assembled from the ETag each part PUT
  // answers with, and without this the browser is not allowed to read that header
  // — the parts upload fine and the file can never be finished.
  ExposeHeaders: ['ETag'],
  MaxAgeSeconds: 3000,
};

/**
 * Sweep up parts from multipart uploads that were never finished.
 *
 * A closed laptop leaves its parts in the bucket, invisible in any file listing
 * and billed for storage forever. The browser bins its own on the way out, but
 * that only covers uploads that got to say goodbye — this covers the rest.
 *
 * Deliberately has **no** `Expiration`: this rule deletes unfinished *parts*, never
 * a stored file. MinIO refuses an abort-only rule for that reason and logs a
 * warning here, which is not the problem it sounds like — it expires stale uploads
 * on its own (24h by default), so only AWS actually needs telling.
 */
export const ABANDONED_PARTS_RULE: LifecycleRule = {
  ID: 'product-hub-abort-incomplete-uploads',
  Status: 'Enabled',
  Filter: { Prefix: '' },
  AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
};

/**
 * Whether a rule already covers what a browser upload needs: the PUT itself, and
 * permission to *read back* the ETag each part answers with. Header matching is
 * case-insensitive, and `*` is a legal wildcard in `ExposeHeaders` on some
 * S3-compatible servers.
 *
 * Exported so `scripts/check-storage-cors.ts` audits a bucket by the same rule the
 * upload path judges it by — a script that disagreed with the service would be
 * worse than no script.
 */
export function allowsBrowserUpload(rule: CORSRule): boolean {
  if (!rule.AllowedMethods?.includes('PUT')) return false;
  return !!rule.ExposeHeaders?.some((h) => {
    const name = h.trim().toLowerCase();
    return name === 'etag' || name === '*';
  });
}

/**
 * S3 wants a part's ETag in the quoted form it handed out. Browsers usually pass
 * it through with the quotes, but not all of them do, and an unquoted one is
 * rejected at the very last step — so normalise instead of trusting either.
 */
function quoteEtag(etag: string): string {
  const bare = etag.trim().replace(/^"|"$/g, '');
  return `"${bare}"`;
}

/** S3 + Azure Blob storage. Clients are built per call from the tenant config. */
@Injectable()
export class StorageService implements IStorageService {
  private readonly logger = new Logger(StorageService.name);

  /**
   * Buckets already prepared in this process, keyed by endpoint + name.
   *
   * A server-side PUT can react to `NoSuchBucket` and retry; a presigned URL
   * cannot — by the time the browser gets a 404 the API is long gone from the
   * conversation. So the bucket check and the CORS rule move *before* signing,
   * and this set keeps that from costing two extra round trips per file.
   */
  private readonly prepared = new Set<string>();

  async upload(config: CloudStorageConfig, file: UploadFileInput): Promise<UploadedMedia> {
    const key = this.buildKey(file.originalName);
    if (config.provider === StorageProvider.S3) return this.uploadS3(config, key, file);
    if (config.provider === StorageProvider.AZURE) return this.uploadAzure(config, key, file);
    throw new BadRequestException('Storage is not configured.');
  }

  /**
   * S3 only, deliberately. A blob SAS signs the *URL*, never the request headers,
   * so an Azure upload link cannot pin the content type the object is stored
   * under — and a `spec.pdf` stored as `text/html` is served back as a web page
   * from the storage domain, which is the exact thing `classifyUpload` exists to
   * prevent. Azure tenants keep the route where the API sets that header itself.
   */
  async createUploadUrl(
    config: CloudStorageConfig,
    input: PresignInput,
  ): Promise<PresignedUpload | null> {
    if (config.provider === StorageProvider.S3) {
      return this.presignS3(config, this.buildKey(input.originalName), input);
    }
    if (config.provider === StorageProvider.AZURE) return null;
    throw new BadRequestException('Storage is not configured.');
  }

  /** S3 only, for the same reason {@link createUploadUrl} is. */
  async createMultipartUpload(
    config: CloudStorageConfig,
    input: PresignInput,
  ): Promise<MultipartUpload | null> {
    if (config.provider === StorageProvider.AZURE) return null;
    if (config.provider !== StorageProvider.S3) {
      throw new BadRequestException('Storage is not configured.');
    }
    this.assertS3(config);

    const partCount = Math.ceil(input.size / MULTIPART_PART_SIZE_BYTES);
    if (partCount < 1 || partCount > MULTIPART_MAX_PARTS) {
      // Unreachable through the API — the hard limit is checked long before here.
      // It stays as a guard because the number of signatures below is driven by it.
      throw new BadRequestException('That file is too large to upload in parts.');
    }

    const key = this.buildKey(input.originalName);
    const client = this.s3(config);
    await this.prepareBucket(client, config);

    // The content type is set *here*, by us, and the parts carry none. So the
    // stored type can't be talked out of what `classifyUpload` decided — the same
    // guarantee `signableHeaders` buys on the single-PUT route, for free.
    const created = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: config.s3Bucket,
        Key: key,
        ContentType: input.contentType,
      }),
    );
    if (!created.UploadId) throw new BadRequestException('Storage did not open the upload.');

    const partUrls = await Promise.all(
      Array.from({ length: partCount }, (_, i) =>
        getSignedUrl(
          client,
          new UploadPartCommand({
            Bucket: config.s3Bucket,
            Key: key,
            UploadId: created.UploadId,
            PartNumber: i + 1,
            // Signed, and exact: every part is full except the last. A client that
            // pads a part gets a 403, so the tenant's cap survives being split up.
            ContentLength: Math.min(
              MULTIPART_PART_SIZE_BYTES,
              input.size - i * MULTIPART_PART_SIZE_BYTES,
            ),
          }),
          { expiresIn: PRESIGN_TTL_SECONDS },
        ),
      ),
    );

    return {
      uploadId: created.UploadId,
      key,
      url: this.publicS3Url(config, key),
      partSize: MULTIPART_PART_SIZE_BYTES,
      partUrls,
      expiresInSeconds: PRESIGN_TTL_SECONDS,
    };
  }

  async completeMultipartUpload(
    config: CloudStorageConfig,
    ref: MultipartRef,
    etags: string[],
  ): Promise<UploadedMedia> {
    this.assertS3(config);
    await this.s3(config).send(
      new CompleteMultipartUploadCommand({
        Bucket: config.s3Bucket,
        Key: ref.key,
        UploadId: ref.uploadId,
        MultipartUpload: {
          Parts: etags.map((etag, i) => ({ PartNumber: i + 1, ETag: quoteEtag(etag) })),
        },
      }),
    );
    return { url: this.publicS3Url(config, ref.key), key: ref.key };
  }

  async abortMultipartUpload(config: CloudStorageConfig, ref: MultipartRef): Promise<void> {
    this.assertS3(config);
    await this.s3(config).send(
      new AbortMultipartUploadCommand({
        Bucket: config.s3Bucket,
        Key: ref.key,
        UploadId: ref.uploadId,
      }),
    );
  }

  async testConnection(config: CloudStorageConfig): Promise<void> {
    if (config.provider === StorageProvider.S3) {
      this.assertS3(config);
      await this.s3(config).send(new HeadBucketCommand({ Bucket: config.s3Bucket }));
      return;
    }
    if (config.provider === StorageProvider.AZURE) {
      this.assertAzure(config);
      const container = BlobServiceClient.fromConnectionString(
        config.azureConnectionString as string,
      ).getContainerClient(config.azureContainer as string);
      await container.getProperties();
      return;
    }
    throw new BadRequestException('Choose a storage provider first.');
  }

  /**
   * A collision-proof, path-safe object key. Uploads are foldered by day
   * (`uploads/yyyy-mm-dd/…`, UTC) so a growing bucket stays browsable instead of
   * one flat list — the same scheme for S3 and Azure, where `/` reads as a
   * virtual folder. Existing objects keep their old keys; only new keys change.
   */
  private buildKey(originalName: string): string {
    const safe = originalName.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80) || 'file';
    const day = new Date().toISOString().slice(0, 10); // yyyy-mm-dd (UTC)
    return `uploads/${day}/${uuid()}-${safe}`;
  }

  private assertS3(config: CloudStorageConfig): void {
    if (!config.s3Bucket || !config.s3AccessKeyId || !config.s3SecretAccessKey) {
      throw new BadRequestException('S3 needs a bucket, access key ID and secret access key.');
    }
  }

  private s3(config: CloudStorageConfig): S3Client {
    return new S3Client({
      region: config.s3Region || 'us-east-1',
      endpoint: config.s3Endpoint || undefined,
      // Path-style addressing is what most S3-compatible endpoints need (MinIO…).
      forcePathStyle: !!config.s3Endpoint,
      credentials: {
        accessKeyId: config.s3AccessKeyId as string,
        secretAccessKey: config.s3SecretAccessKey as string,
      },
    });
  }

  private async uploadS3(
    config: CloudStorageConfig,
    key: string,
    file: UploadFileInput,
  ): Promise<UploadedMedia> {
    this.assertS3(config);
    const client = this.s3(config);
    const put = () =>
      client.send(
        new PutObjectCommand({
          Bucket: config.s3Bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.contentType,
        }),
      );

    try {
      await put();
    } catch (err) {
      // A missing bucket is a setup slip, not a server fault: create the bucket
      // the admin named and retry once, so the first upload provisions it.
      if (this.isMissingBucket(err)) {
        await this.ensureBucket(client, config);
        await put();
      } else {
        throw err;
      }
    }

    return { url: this.publicS3Url(config, key), key };
  }

  /**
   * Where an object is readable from once stored — the CDN base an admin set, the
   * S3-compatible endpoint, or the bucket's own AWS hostname. Deliberately *not*
   * derived from the presigned URL: that one carries the signature in its query
   * string and expires.
   */
  private publicS3Url(config: CloudStorageConfig, key: string): string {
    const strip = (s: string) => s.replace(/\/+$/, '');
    const base = config.s3PublicBaseUrl
      ? strip(config.s3PublicBaseUrl)
      : config.s3Endpoint
        ? `${strip(config.s3Endpoint)}/${config.s3Bucket}`
        : `https://${config.s3Bucket}.s3.${config.s3Region || 'us-east-1'}.amazonaws.com`;
    return `${base}/${key}`;
  }

  private async presignS3(
    config: CloudStorageConfig,
    key: string,
    input: PresignInput,
  ): Promise<PresignedUpload> {
    this.assertS3(config);
    const client = this.s3(config);
    await this.prepareBucket(client, config);

    // Both headers are *signed*, which is what keeps a direct-to-bucket upload
    // under the same rules a server-side one is:
    //
    //  • `ContentLength` — the size was checked already, but against a number the
    //    browser reported. Signing it means a client that understates its file
    //    gets a 403 from S3 rather than a free pass around the tenant's cap.
    //  • `ContentType` — `signableHeaders` is not optional here. The presigner
    //    leaves content-type *unsigned* by default, and the object is then stored
    //    as whatever the PUT declares: `spec.pdf` uploaded as `text/html` would be
    //    served back as a web page from the storage domain, which is the exact
    //    thing `classifyUpload` exists to prevent.
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: key,
        ContentType: input.contentType,
        ContentLength: input.size,
      }),
      { expiresIn: PRESIGN_TTL_SECONDS, signableHeaders: new Set(['content-type']) },
    );

    return {
      uploadUrl,
      url: this.publicS3Url(config, key),
      headers: { 'Content-Type': input.contentType },
      expiresInSeconds: PRESIGN_TTL_SECONDS,
    };
  }

  /** Bucket exists and accepts a browser PUT — run once per bucket per process. */
  private async prepareBucket(client: S3Client, config: CloudStorageConfig): Promise<void> {
    const id = `s3:${config.s3Endpoint || config.s3Region || 'aws'}/${config.s3Bucket}`;
    if (this.prepared.has(id)) return;

    try {
      await client.send(new HeadBucketCommand({ Bucket: config.s3Bucket }));
    } catch (err) {
      // Same courtesy the server-side path already extends: the first upload
      // provisions the bucket an admin named but never created.
      if (this.isMissingBucket(err)) await this.ensureBucket(client, config);
      else throw err;
    }

    await this.ensureBucketCors(client, config);
    await this.ensureBucketLifecycle(client, config);
    this.prepared.add(id);
  }

  /**
   * Add the abandoned-parts sweep if the bucket has nothing like it.
   *
   * Additive and best-effort for the same reasons the CORS rule is: the bucket may
   * belong to more than this app, and a narrow key won't hold
   * `s3:PutLifecycleConfiguration`. Missing it costs a little storage, not an
   * upload, so it must never be the thing that fails one.
   */
  private async ensureBucketLifecycle(client: S3Client, config: CloudStorageConfig): Promise<void> {
    try {
      let existing: LifecycleRule[] = [];
      try {
        const current = await client.send(
          new GetBucketLifecycleConfigurationCommand({ Bucket: config.s3Bucket }),
        );
        existing = current.Rules ?? [];
      } catch {
        /* No lifecycle configuration yet — `existing` stays empty. */
      }
      if (existing.some((rule) => rule.AbortIncompleteMultipartUpload)) return;
      await client.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: config.s3Bucket,
          LifecycleConfiguration: { Rules: [...existing, ABANDONED_PARTS_RULE] },
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Could not set the incomplete-upload lifecycle rule on bucket "${config.s3Bucket}" ` +
          `(${(err as Error).message}). Harmless on servers that expire stale uploads themselves ` +
          '(MinIO does); on AWS, add an AbortIncompleteMultipartUpload rule so abandoned parts ' +
          'are not billed indefinitely.',
      );
    }
  }

  /**
   * Add the browser-upload CORS rule if nothing already allows a PUT.
   *
   * Additive, never a replacement — a bucket shared with something else keeps its
   * own rules. Best-effort by design: plenty of S3-compatible services don't
   * implement the CORS API at all, and a key scoped to objects won't hold
   * `s3:PutBucketCors`. Failing here would block an upload that may well work, so
   * it logs and moves on; the browser reports the real problem if it doesn't.
   */
  private async ensureBucketCors(client: S3Client, config: CloudStorageConfig): Promise<void> {
    try {
      let existing: CORSRule[] = [];
      try {
        const current = await client.send(new GetBucketCorsCommand({ Bucket: config.s3Bucket }));
        existing = current.CORSRules ?? [];
      } catch {
        /* No CORS configuration yet — `existing` stays empty. */
      }
      // Both halves, not just PUT. A bucket that allows PUT but doesn't expose the
      // ETag header takes every part happily and can never join them — the upload
      // looks fine right up to the last step, every time. Treating that as "already
      // configured" would leave the tenant permanently on the slow path.
      if (existing.some(allowsBrowserUpload)) return;
      await client.send(
        new PutBucketCorsCommand({
          Bucket: config.s3Bucket,
          CORSConfiguration: { CORSRules: [...existing, BROWSER_UPLOAD_CORS] },
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Could not set CORS on bucket "${config.s3Bucket}" (${(err as Error).message}). ` +
          'Direct browser uploads need the bucket to allow PUT from your app origin AND to expose ' +
          'the ETag header (ExposeHeaders: ["ETag"]) — without the latter, large files upload but ' +
          'can never be finished. Set it in the bucket settings, or grant this key s3:PutBucketCors ' +
          'and run `npm run storage:cors` to see and fix it.',
      );
    }
  }

  /** `PutObject` says `NoSuchBucket`; `HeadBucket` has no body and answers a bare 404. */
  private isMissingBucket(err: unknown): boolean {
    const e = err as
      | { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } }
      | undefined;
    if (e?.name === 'NoSuchBucket' || e?.Code === 'NoSuchBucket') return true;
    return e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404;
  }

  /** Create the configured bucket on first use. AWS requires a LocationConstraint
   * for every region except us-east-1; S3-compatible endpoints (MinIO…) ignore
   * it. If it can't be created, surface an actionable 400 rather than a 500. */
  private async ensureBucket(client: S3Client, config: CloudStorageConfig): Promise<void> {
    const region = config.s3Region || 'us-east-1';
    const withConstraint = !config.s3Endpoint && region !== 'us-east-1';
    try {
      await client.send(
        new CreateBucketCommand({
          Bucket: config.s3Bucket,
          ...(withConstraint
            ? {
                CreateBucketConfiguration: {
                  LocationConstraint: region as BucketLocationConstraint,
                },
              }
            : {}),
        }),
      );
    } catch (err) {
      const name = (err as { name?: string })?.name;
      // Raced with another upload (or it already existed) — that's fine.
      if (name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists') return;
      throw new BadRequestException(
        `Storage bucket "${config.s3Bucket}" doesn't exist and couldn't be created automatically ` +
          `(${(err as Error).message}). Create it in your provider, or fix Settings → Storage.`,
      );
    }
  }

  private assertAzure(config: CloudStorageConfig): void {
    if (!config.azureConnectionString || !config.azureContainer) {
      throw new BadRequestException('Azure needs a connection string and a container.');
    }
  }

  private async uploadAzure(
    config: CloudStorageConfig,
    key: string,
    file: UploadFileInput,
  ): Promise<UploadedMedia> {
    this.assertAzure(config);
    const container = BlobServiceClient.fromConnectionString(
      config.azureConnectionString as string,
    ).getContainerClient(config.azureContainer as string);
    const blob = container.getBlockBlobClient(key);
    await blob.uploadData(file.buffer, {
      blobHTTPHeaders: { blobContentType: file.contentType },
    });
    return { url: blob.url, key };
  }
}
