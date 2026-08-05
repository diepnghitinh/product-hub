import { Inject, Injectable } from '@nestjs/common';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import { defaultStorageConfig } from '@application/app-settings/domain/storage.types';
import { planUpload } from '../domain/upload-limits';
import { IStorageService, UploadFileInput } from '../storage.port';

export interface UploadedMediaResult {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

/**
 * Store one image, short video or document in the tenant's configured cloud
 * storage. The size ceiling is per kind and comes from the tenant's own config
 * (videos default to 30MB), so the limit an admin sets in Settings is the one
 * enforced.
 */
@Injectable()
export class UploadMediaUseCase {
  constructor(
    @Inject(IAppSettingsRepository) private readonly settingsRepo: IAppSettingsRepository,
    @Inject(IStorageService) private readonly storage: IStorageService,
  ) {}

  async execute(tenantId: string, file: UploadFileInput): Promise<UploadedMediaResult> {
    const settings = await this.settingsRepo.findByTenant(tenantId);
    const config = settings?.storage ?? defaultStorageConfig();

    const classified = planUpload(config, file);

    // Stored under the classified type, not the one the browser claimed — see
    // `classifyUpload`.
    const stored = { ...file, contentType: classified.contentType };
    const { url } = await this.storage.upload(config, stored);
    return { url, name: file.originalName, contentType: stored.contentType, size: file.size };
  }
}
