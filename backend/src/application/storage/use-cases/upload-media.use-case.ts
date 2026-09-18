import { Inject, Injectable } from '@nestjs/common';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import { defaultStorageConfig } from '@application/app-settings/domain/storage.types';
import { IStorageService, UploadFileInput } from '../storage.port';
import { resolveUpload } from './upload-policy';

export interface UploadedMediaResult {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

/**
 * Store one image, short video or document in the tenant's configured cloud
 * storage, with the bytes passing through the API.
 *
 * This is now the *fallback* door — the browser normally uploads straight to the
 * provider via {@link CreateUploadUrlUseCase}. It stays because some callers have
 * no browser to sign for (the MCP upload ticket, a `curl`) and because a tenant
 * whose bucket has no usable CORS rule would otherwise have no way to upload at
 * all. Both doors judge a file with the same {@link resolveUpload}.
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
    const classified = resolveUpload(config, file);

    // Stored under the classified type, not the one the browser claimed — see
    // `classifyUpload`.
    const stored = { ...file, contentType: classified.contentType };
    const { url } = await this.storage.upload(config, stored);
    return { url, name: file.originalName, contentType: stored.contentType, size: file.size };
  }
}
