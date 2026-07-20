import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import { defaultStorageConfig } from '@application/app-settings/domain/storage.types';
import { UpdateStorageDto } from '@application/app-settings/dtos/app-settings.dtos';
import { mergeStorageConfig } from '@application/app-settings/use-cases/app-settings.use-cases';
import { IStorageService } from '../storage.port';

/**
 * Check whether a storage config actually works, before saving it. The form may
 * leave a secret blank (it's never shown back), so the entered values are merged
 * over the stored config first — the same merge the save uses.
 */
@Injectable()
export class TestStorageConnectionUseCase {
  constructor(
    @Inject(IAppSettingsRepository) private readonly settingsRepo: IAppSettingsRepository,
    @Inject(IStorageService) private readonly storage: IStorageService,
  ) {}

  async execute(tenantId: string, dto: UpdateStorageDto): Promise<void> {
    const settings = await this.settingsRepo.findByTenant(tenantId);
    const current = settings?.storage ?? defaultStorageConfig();
    try {
      await this.storage.testConnection(mergeStorageConfig(current, dto));
    } catch (e) {
      // Surface a clean 400 with the provider's reason, not a 500 stack.
      throw new BadRequestException(`Connection failed: ${(e as Error).message}`);
    }
  }
}
