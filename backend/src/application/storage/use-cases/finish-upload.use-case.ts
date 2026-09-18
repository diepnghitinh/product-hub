import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import { defaultStorageConfig } from '@application/app-settings/domain/storage.types';
import { IStorageService, MultipartRef } from '../storage.port';

/** Where the finished object is readable. */
export interface FinishedUploadResult {
  url: string;
}

/**
 * Join the parts of a multipart upload, or bin one that will never finish.
 *
 * Both ends of the same story, so they live together: whichever way an upload
 * stops, the tenant's own config decides which bucket it is talking about, and the
 * `uploadId` the browser holds is what proves it owns the upload — it was minted
 * by the provider, for this tenant's bucket, a few minutes ago.
 *
 * There is no cross-tenant reach here even though the key comes from the client:
 * the bucket is read from the caller's own settings, never from the request.
 */
@Injectable()
export class FinishUploadUseCase {
  constructor(
    @Inject(IAppSettingsRepository) private readonly settingsRepo: IAppSettingsRepository,
    @Inject(IStorageService) private readonly storage: IStorageService,
  ) {}

  async complete(
    tenantId: string,
    ref: MultipartRef,
    etags: string[],
  ): Promise<FinishedUploadResult> {
    if (!etags.length) throw new BadRequestException('No uploaded parts to join.');
    if (etags.some((etag) => !etag.trim())) {
      // A blank means a part the browser never got an ETag back for. Joining
      // anyway would store a file with a hole in it and call it a success.
      throw new BadRequestException('One of the parts did not finish uploading.');
    }
    const config = await this.configFor(tenantId);
    const { url } = await this.storage.completeMultipartUpload(config, ref, etags);
    return { url };
  }

  async abort(tenantId: string, ref: MultipartRef): Promise<void> {
    const config = await this.configFor(tenantId);
    await this.storage.abortMultipartUpload(config, ref);
  }

  private async configFor(tenantId: string) {
    const settings = await this.settingsRepo.findByTenant(tenantId);
    return settings?.storage ?? defaultStorageConfig();
  }
}
