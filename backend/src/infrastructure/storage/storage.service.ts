import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  type BucketLocationConstraint,
} from '@aws-sdk/client-s3';
import { BlobServiceClient } from '@azure/storage-blob';
import { v4 as uuid } from 'uuid';
import {
  CloudStorageConfig,
  StorageProvider,
} from '@application/app-settings/domain/storage.types';
import { IStorageService, UploadFileInput, UploadedMedia } from '@application/storage/storage.port';

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

  /** A collision-proof, path-safe object key under an `uploads/` prefix. */
  private buildKey(originalName: string): string {
    const safe = originalName.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80) || 'file';
    return `uploads/${uuid()}-${safe}`;
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

    const strip = (s: string) => s.replace(/\/+$/, '');
    const base = config.s3PublicBaseUrl
      ? strip(config.s3PublicBaseUrl)
      : config.s3Endpoint
        ? `${strip(config.s3Endpoint)}/${config.s3Bucket}`
        : `https://${config.s3Bucket}.s3.${config.s3Region || 'us-east-1'}.amazonaws.com`;
    return { url: `${base}/${key}`, key };
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
