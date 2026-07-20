/** Which cloud provider stores uploaded media. `none` = uploads are disabled. */
export enum StorageProvider {
  NONE = 'none',
  S3 = 's3',
  AZURE = 'azure',
}

export const STORAGE_PROVIDERS: StorageProvider[] = [
  StorageProvider.NONE,
  StorageProvider.S3,
  StorageProvider.AZURE,
];

/** The product cares about short videos (default cap 30MB); images get a smaller cap. */
export const DEFAULT_MAX_VIDEO_MB = 30;
export const DEFAULT_MAX_IMAGE_MB = 10;

/**
 * Per-tenant cloud-storage config for uploading short videos + images. The two
 * secret fields (`s3SecretAccessKey`, `azureConnectionString`) are persisted but
 * NEVER returned to the client — the API masks them to `*Configured` booleans.
 */
export interface CloudStorageConfig {
  provider: StorageProvider;
  // AWS S3 (or any S3-compatible service: MinIO, Cloudflare R2, …)
  s3Region?: string;
  s3Bucket?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string; // secret
  s3Endpoint?: string; // optional, for S3-compatible endpoints
  s3PublicBaseUrl?: string; // optional CDN / public base used to build file URLs
  // Azure Blob Storage
  azureConnectionString?: string; // secret
  azureContainer?: string;
  // Media size caps (MB)
  maxVideoMb: number;
  maxImageMb: number;
}

/** A fresh config with uploads disabled and the shipped size caps. */
export function defaultStorageConfig(): CloudStorageConfig {
  return {
    provider: StorageProvider.NONE,
    maxVideoMb: DEFAULT_MAX_VIDEO_MB,
    maxImageMb: DEFAULT_MAX_IMAGE_MB,
  };
}
