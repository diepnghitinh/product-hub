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

/** A file the browser is about to PUT straight to the provider. */
export interface PresignInput {
  originalName: string;
  /** The type it will be *stored* as — already classified, see `classifyUpload`. */
  contentType: string;
  size: number;
}

/** A one-shot URL to PUT bytes to, plus where they'll be readable afterwards. */
export interface PresignedUpload {
  /** PUT the raw file here. Valid for `expiresInSeconds`. */
  uploadUrl: string;
  /** The public URL the object will have once the PUT succeeds. */
  url: string;
  /**
   * Headers the PUT must send **verbatim** — on S3 they're part of the signature,
   * on Azure they're what makes it a block blob with the right content type.
   * Never contains `Content-Length`: a browser refuses to set that one by hand and
   * sends it itself from the body.
   */
  headers: Record<string, string>;
  expiresInSeconds: number;
}

/**
 * A large file the browser uploads in numbered pieces.
 *
 * The reason this exists and a plain signed PUT isn't enough: one PUT has no
 * notion of where it got to, so a connection that drops at 90% costs the whole
 * file. Parts are acknowledged one at a time, so a drop costs the part in flight
 * and nothing else.
 */
export interface MultipartUpload {
  /** The provider's handle for the upload in progress. Needed to finish or bin it. */
  uploadId: string;
  key: string;
  /** Where the assembled object will be readable, once the parts are joined. */
  url: string;
  /** Bytes per part. Every part is exactly this except the last, which is the remainder. */
  partSize: number;
  /** One signed PUT URL per part, in order — index `i` is part number `i + 1`. */
  partUrls: string[];
  expiresInSeconds: number;
}

/** An upload in progress, as the browser hands it back to be finished or binned. */
export interface MultipartRef {
  key: string;
  uploadId: string;
}

/**
 * Port for the cloud storage backend, implemented per provider (S3, Azure) in
 * infrastructure. The config is passed in per call because it's per-tenant and
 * changes at runtime (edited in Settings), not wired once at boot.
 */
export abstract class IStorageService {
  abstract upload(config: CloudStorageConfig, file: UploadFileInput): Promise<UploadedMedia>;
  /**
   * Hand back a short-lived URL the *browser* uploads to directly, so the bytes
   * never pass through the API. `null` when the configured provider can't issue
   * one safely — the caller then falls back to {@link upload}. Throws the same
   * actionable 400s `upload` does when the provider isn't usable at all.
   */
  abstract createUploadUrl(
    config: CloudStorageConfig,
    input: PresignInput,
  ): Promise<PresignedUpload | null>;
  /**
   * Open a multipart upload and sign every part up front. `null` when the provider
   * has no such thing — the caller falls back to {@link createUploadUrl}, and from
   * there to {@link upload}.
   */
  abstract createMultipartUpload(
    config: CloudStorageConfig,
    input: PresignInput,
  ): Promise<MultipartUpload | null>;
  /**
   * Join the uploaded parts into the finished object. `etags` is what each part
   * PUT answered with, in part order — the provider uses them to verify it is
   * assembling the same bytes it stored.
   */
  abstract completeMultipartUpload(
    config: CloudStorageConfig,
    ref: MultipartRef,
    etags: string[],
  ): Promise<UploadedMedia>;
  /**
   * Bin an upload that will never finish. Parts already stored are billed until
   * they're dropped, so this is called whenever the browser gives up — best-effort
   * on the caller's side, since the bucket lifecycle rule sweeps the rest.
   */
  abstract abortMultipartUpload(config: CloudStorageConfig, ref: MultipartRef): Promise<void>;
  /** Verify the credentials/bucket are reachable. Throws on failure. */
  abstract testConnection(config: CloudStorageConfig): Promise<void>;
}
