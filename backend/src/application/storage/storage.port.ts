import { CloudStorageConfig } from '@application/app-settings/domain/storage.types';

/** A file to store, already read into memory by the upload interceptor. */
export interface UploadFileInput {
  buffer: Buffer;
  contentType: string;
  originalName: string;
  size: number;
}

/** Where a stored file ended up. */
export interface UploadedMedia {
  url: string;
  key: string;
}

/**
 * Port for the cloud storage backend, implemented per provider (S3, Azure) in
 * infrastructure. The config is passed in per call because it's per-tenant and
 * changes at runtime (edited in Settings), not wired once at boot.
 */
export abstract class IStorageService {
  abstract upload(config: CloudStorageConfig, file: UploadFileInput): Promise<UploadedMedia>;
  /** Verify the credentials/bucket are reachable. Throws on failure. */
  abstract testConnection(config: CloudStorageConfig): Promise<void>;
  /**
   * The prefix every URL this config produces starts with, without a trailing
   * slash — e.g. `https://bucket.s3.eu-west-1.amazonaws.com`. `null` when the
   * provider is `none` or the config is too incomplete to know.
   *
   * This is the allowlist the file proxy checks a requested URL against, which is
   * why it lives on the port rather than being re-derived by the caller: the
   * rule that decides what a stored URL looks like and the rule that decides
   * what may be fetched back have to be the same rule.
   */
  abstract publicBaseUrl(config: CloudStorageConfig): string | null;
}
