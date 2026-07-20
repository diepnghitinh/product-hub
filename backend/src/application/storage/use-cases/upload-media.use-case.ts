import {
  BadRequestException,
  Inject,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import {
  StorageProvider,
  defaultStorageConfig,
} from '@application/app-settings/domain/storage.types';
import { IStorageService, UploadFileInput } from '../storage.port';

export interface UploadedMediaResult {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

/**
 * Store one image or short video in the tenant's configured cloud storage. The
 * size ceiling is per media type and comes from the tenant's own config (videos
 * default to 30MB), so the limit an admin sets in Settings is the one enforced.
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

    if (config.provider === StorageProvider.NONE) {
      throw new BadRequestException(
        'Media storage is not configured. Ask an admin to set it up in Settings → Storage.',
      );
    }

    const isVideo = file.contentType.startsWith('video/');
    const isImage = file.contentType.startsWith('image/');
    if (!isVideo && !isImage) {
      throw new BadRequestException('Only image and video files can be uploaded.');
    }

    const capMb = isVideo ? config.maxVideoMb : config.maxImageMb;
    if (file.size > capMb * 1024 * 1024) {
      throw new PayloadTooLargeException(
        `${isVideo ? 'Video' : 'Image'} is too large — the limit is ${capMb}MB.`,
      );
    }

    const { url } = await this.storage.upload(config, file);
    return { url, name: file.originalName, contentType: file.contentType, size: file.size };
  }
}
