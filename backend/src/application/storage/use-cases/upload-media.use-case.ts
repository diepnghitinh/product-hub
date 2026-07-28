import {
  BadRequestException,
  Inject,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import {
  DEFAULT_MAX_DOC_MB,
  StorageProvider,
  defaultStorageConfig,
} from '@application/app-settings/domain/storage.types';
import { UploadKind, classifyUpload } from '../domain/upload-kind';
import { IStorageService, UploadFileInput } from '../storage.port';

export interface UploadedMediaResult {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

/** What each kind is called when it's too big, and which cap it answers to. */
const KIND_LABEL: Record<UploadKind, string> = {
  [UploadKind.IMAGE]: 'Image',
  [UploadKind.VIDEO]: 'Video',
  [UploadKind.DOCUMENT]: 'File',
};

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

    if (config.provider === StorageProvider.NONE) {
      throw new BadRequestException(
        'Media storage is not configured. Ask an admin to set it up in Settings → Storage.',
      );
    }

    const classified = classifyUpload(file.contentType, file.originalName);
    if (!classified) {
      throw new BadRequestException(
        'That file type cannot be uploaded — images, videos, PDFs, Office documents and text files are accepted.',
      );
    }

    const capMb =
      classified.kind === UploadKind.VIDEO
        ? config.maxVideoMb
        : classified.kind === UploadKind.DOCUMENT
          ? // Absent on configs saved before documents were uploadable.
            (config.maxDocMb ?? DEFAULT_MAX_DOC_MB)
          : config.maxImageMb;
    if (file.size > capMb * 1024 * 1024) {
      throw new PayloadTooLargeException(
        `${KIND_LABEL[classified.kind]} is too large — the limit is ${capMb}MB.`,
      );
    }

    // Stored under the classified type, not the one the browser claimed — see
    // `classifyUpload`.
    const stored = { ...file, contentType: classified.contentType };
    const { url } = await this.storage.upload(config, stored);
    return { url, name: file.originalName, contentType: stored.contentType, size: file.size };
  }
}
