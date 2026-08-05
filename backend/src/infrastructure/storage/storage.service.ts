import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type BucketLocationConstraint,
} from '@aws-sdk/client-s3';
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import { v4 as uuid } from 'uuid';
import {
  CloudStorageConfig,
  StorageProvider,
} from '@application/app-settings/domain/storage.types';
import {
  IStorageService,
  MultipartTarget,
  UploadFileInput,
  UploadedMedia,
  UploadedPart,
} from '@application/storage/storage.port';
import { storageKeySlug } from '@application/storage/domain/filename';

/** Drop trailing slashes so a base and a key always join with exactly one. */
const strip = (s: string) => s.replace(/\/+$/, '');

/**
 * Azure's id for one staged block. Every block of a blob must use an id of the
 * *same* byte length, and the order of `commitBlockList` is what assembles the
 * file — so the id is the part number, zero-padded to a fixed width, base64'd.
 * Derived, never stored: a re-sent chunk overwrites its own block.
 */
const azureBlockId = (partNumber: number) =>
  Buffer.from(String(partNumber).padStart(6, '0'), 'utf8').toString('base64');

/** S3 + Azure Blob storage. Clients are built per call from the tenant config. */
@Injectable()
export class StorageService implements IStorageService {
  async upload(config: CloudStorageConfig, file: UploadFileInput): Promise<UploadedMedia> {
    const key = this.buildKey(file.originalName);
    if (config.provider === StorageProvider.S3) return this.uploadS3(config, key, file);
    if (config.provider === StorageProvider.AZURE) return this.uploadAzure(config, key, file);
    throw new BadRequestException('Storage is not configured.');
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

  /** See {@link IStorageService.publicBaseUrl}. Built from the config alone — no
   *  network call — so the proxy can check a URL on every request cheaply. */
  publicBaseUrl(config: CloudStorageConfig): string | null {
    if (config.provider === StorageProvider.S3) {
      if (!config.s3Bucket) return null;
      return this.s3Base(config);
    }
    if (config.provider === StorageProvider.AZURE) {
      if (!config.azureConnectionString || !config.azureContainer) return null;
      try {
        return strip(
          BlobServiceClient.fromConnectionString(config.azureConnectionString).getContainerClient(
            config.azureContainer,
          ).url,
        );
      } catch {
        // A malformed connection string is a config problem, not a request one —
        // the proxy reports "not configured" rather than throwing a 500 here.
        return null;
      }
    }
    return null;
  }

  /** Where an S3 object's public URL starts: the CDN base an admin set, else the
   *  custom endpoint + bucket (MinIO, R2…), else the AWS virtual-host name. */
  private s3Base(config: CloudStorageConfig): string {
    if (config.s3PublicBaseUrl) return strip(config.s3PublicBaseUrl);
    if (config.s3Endpoint) return `${strip(config.s3Endpoint)}/${config.s3Bucket}`;
    return `https://${config.s3Bucket}.s3.${config.s3Region || 'us-east-1'}.amazonaws.com`;
  }

  /**
   * A collision-proof, path-safe object key. Uploads are foldered by day
   * (`uploads/yyyy-mm-dd/…`, UTC) so a growing bucket stays browsable instead of
   * one flat list — the same scheme for S3 and Azure, where `/` reads as a
   * virtual folder. Existing objects keep their old keys; only new keys change.
   */
  private buildKey(originalName: string): string {
    const day = new Date().toISOString().slice(0, 10); // yyyy-mm-dd (UTC)
    return `uploads/${day}/${uuid()}-${storageKeySlug(originalName)}`;
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

    return { url: `${this.s3Base(config)}/${key}`, key };
  }

  async createMultipart(
    config: CloudStorageConfig,
    file: { originalName: string; contentType: string },
  ): Promise<MultipartTarget> {
    const key = this.buildKey(file.originalName);

    if (config.provider === StorageProvider.S3) {
      this.assertS3(config);
      const client = this.s3(config);
      const create = () =>
        client.send(
          new CreateMultipartUploadCommand({
            Bucket: config.s3Bucket,
            Key: key,
            ContentType: file.contentType,
          }),
        );
      let res;
      try {
        res = await create();
      } catch (err) {
        // Same first-upload-provisions-the-bucket rule as the single-shot path.
        if (!this.isMissingBucket(err)) throw err;
        await this.ensureBucket(client, config);
        res = await create();
      }
      if (!res.UploadId) throw new BadRequestException('Storage did not start the upload.');
      return { key, uploadId: res.UploadId };
    }

    if (config.provider === StorageProvider.AZURE) {
      this.assertAzure(config);
      // Azure has no upload id: staged blocks live on the (not yet committed)
      // blob itself, so the key is the whole handle.
      this.azure(config).getBlockBlobClient(key);
      return { key, uploadId: 'azure' };
    }

    throw new BadRequestException('Storage is not configured.');
  }

  async uploadPart(
    config: CloudStorageConfig,
    target: MultipartTarget,
    partNumber: number,
    body: Buffer,
  ): Promise<UploadedPart> {
    if (config.provider === StorageProvider.S3) {
      this.assertS3(config);
      const res = await this.s3(config).send(
        new UploadPartCommand({
          Bucket: config.s3Bucket,
          Key: target.key,
          UploadId: target.uploadId,
          PartNumber: partNumber,
          Body: body,
        }),
      );
      if (!res.ETag) throw new BadRequestException('Storage did not accept that chunk.');
      return { partNumber, etag: res.ETag };
    }

    if (config.provider === StorageProvider.AZURE) {
      this.assertAzure(config);
      await this.azure(config)
        .getBlockBlobClient(target.key)
        .stageBlock(azureBlockId(partNumber), body, body.length);
      return { partNumber, etag: '' };
    }

    throw new BadRequestException('Storage is not configured.');
  }

  async completeMultipart(
    config: CloudStorageConfig,
    target: MultipartTarget,
    parts: UploadedPart[],
    contentType: string,
  ): Promise<UploadedMedia> {
    // Both providers assemble in the order given, not the order received.
    const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);

    if (config.provider === StorageProvider.S3) {
      this.assertS3(config);
      await this.s3(config).send(
        new CompleteMultipartUploadCommand({
          Bucket: config.s3Bucket,
          Key: target.key,
          UploadId: target.uploadId,
          MultipartUpload: {
            Parts: ordered.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
          },
        }),
      );
      return { url: `${this.s3Base(config)}/${target.key}`, key: target.key };
    }

    if (config.provider === StorageProvider.AZURE) {
      this.assertAzure(config);
      const blob = this.azure(config).getBlockBlobClient(target.key);
      await blob.commitBlockList(
        ordered.map((p) => azureBlockId(p.partNumber)),
        { blobHTTPHeaders: { blobContentType: contentType } },
      );
      return { url: blob.url, key: target.key };
    }

    throw new BadRequestException('Storage is not configured.');
  }

  async abortMultipart(config: CloudStorageConfig, target: MultipartTarget): Promise<void> {
    if (config.provider === StorageProvider.S3) {
      this.assertS3(config);
      await this.s3(config).send(
        new AbortMultipartUploadCommand({
          Bucket: config.s3Bucket,
          Key: target.key,
          UploadId: target.uploadId,
        }),
      );
      return;
    }
    // Azure has no abort: blocks that were never committed are not a blob, cost
    // nothing to read, and the service garbage-collects them after 7 days.
  }

  private isMissingBucket(err: unknown): boolean {
    const e = err as { name?: string; Code?: string } | undefined;
    return e?.name === 'NoSuchBucket' || e?.Code === 'NoSuchBucket';
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

  private azure(config: CloudStorageConfig): ContainerClient {
    return BlobServiceClient.fromConnectionString(
      config.azureConnectionString as string,
    ).getContainerClient(config.azureContainer as string);
  }

  private async uploadAzure(
    config: CloudStorageConfig,
    key: string,
    file: UploadFileInput,
  ): Promise<UploadedMedia> {
    this.assertAzure(config);
    const blob = this.azure(config).getBlockBlobClient(key);
    await blob.uploadData(file.buffer, {
      blobHTTPHeaders: { blobContentType: file.contentType },
    });
    return { url: blob.url, key };
  }
}
