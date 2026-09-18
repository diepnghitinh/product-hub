import { Inject, Injectable } from '@nestjs/common';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import { defaultStorageConfig } from '@application/app-settings/domain/storage.types';
import { IStorageService } from '../storage.port';
import { MULTIPART_THRESHOLD_BYTES, UploadCandidate, resolveUpload } from './upload-policy';

/**
 * A signed upload the browser can spend, flat for the API response.
 *
 * One shape covers all three routes, and `uploadId` is what picks between them:
 * set means upload it in parts; blank with a `uploadUrl` means one PUT; blank with
 * neither means this provider can't be uploaded to directly at all, so send the
 * bytes to `POST /uploads`. The client never has to ask twice.
 */
export interface PresignedUploadResult {
  /**
   * PUT the raw file here — this is the provider, not us.
   *
   * **Empty when the file goes up in parts, and when the tenant's provider can't
   * sign one at all** (today: Azure). In the second case the file was still judged
   * and accepted; it just has to go through `POST /uploads` instead. An empty
   * string rather than an absent field so the shape a caller destructures never
   * changes.
   */
  uploadUrl: string;
  /** The public URL the file will have once the upload succeeds. */
  url: string;
  name: string;
  /** What it will be stored as. May differ from what the browser claimed. */
  contentType: string;
  size: number;
  /** Send these on the PUT exactly as given — they're part of the signature. */
  headers: Record<string, string>;
  expiresInSeconds: number;
  /**
   * The provider's handle on a multipart upload — **blank unless the file is going
   * up in parts.** Hand it back to `/uploads/multipart/complete` with the parts'
   * ETags to finish, or to `/uploads/multipart/abort` to bin it.
   */
  uploadId: string;
  /** The object key, needed alongside `uploadId`. Blank on the single-PUT route. */
  key: string;
  /** Bytes per part; the last part is the remainder. 0 on the single-PUT route. */
  partSize: number;
  /** A signed PUT URL per part, in order — index `i` is part number `i + 1`. */
  partUrls: string[];
}

/**
 * Sign a URL that lets the browser upload straight into the tenant's bucket.
 *
 * Why this exists: routing every file through the API meant each upload crossed
 * the wire twice, sat whole in the API's memory on the way past, and had a
 * request timeout in the middle of it. A 200MB screen recording made all three
 * hurt at once. Signing costs no bandwidth and the bytes go browser → bucket.
 *
 * The rules did not move with them. `resolveUpload` runs *before* the signature
 * exists, so an unaccepted type or an over-cap file is refused with the same
 * sentence it always was — the difference is it's refused before a byte is sent
 * rather than after the whole file has been pushed. The declared size is then
 * signed into the URL (S3), so understating it buys nothing.
 *
 * Above {@link MULTIPART_THRESHOLD_BYTES} the file is signed as a **multipart**
 * upload instead — same rules, same signing, but in numbered pieces, so a
 * connection that drops at 90% costs one piece rather than the whole file. Which
 * one the client got is written in the answer; it doesn't choose.
 */
@Injectable()
export class CreateUploadUrlUseCase {
  constructor(
    @Inject(IAppSettingsRepository) private readonly settingsRepo: IAppSettingsRepository,
    @Inject(IStorageService) private readonly storage: IStorageService,
  ) {}

  async execute(tenantId: string, file: UploadCandidate): Promise<PresignedUploadResult> {
    const settings = await this.settingsRepo.findByTenant(tenantId);
    const config = settings?.storage ?? defaultStorageConfig();
    const classified = resolveUpload(config, file);
    const input = {
      originalName: file.originalName,
      contentType: classified.contentType,
      size: file.size,
    };
    const verdict = {
      name: file.originalName,
      contentType: classified.contentType,
      size: file.size,
    };

    if (file.size >= MULTIPART_THRESHOLD_BYTES) {
      const multipart = await this.storage.createMultipartUpload(config, input);
      // `null` is a provider with no multipart of its own — not a failure, just a
      // file that goes up the ordinary way.
      if (multipart) {
        return {
          ...verdict,
          uploadUrl: '',
          url: multipart.url,
          headers: {},
          expiresInSeconds: multipart.expiresInSeconds,
          uploadId: multipart.uploadId,
          key: multipart.key,
          partSize: multipart.partSize,
          partUrls: multipart.partUrls,
        };
      }
    }

    const signed = await this.storage.createUploadUrl(config, input);
    return {
      ...verdict,
      // `null` means the provider can't sign — the verdict on the file still
      // stands, the bytes just take the slower road. Answering that here rather
      // than with an error keeps one call shape for the client.
      uploadUrl: signed?.uploadUrl ?? '',
      url: signed?.url ?? '',
      headers: signed?.headers ?? {},
      expiresInSeconds: signed?.expiresInSeconds ?? 0,
      uploadId: '',
      key: '',
      partSize: 0,
      partUrls: [],
    };
  }
}
