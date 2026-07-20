import { Module } from '@nestjs/common';
import { InfrastructureStorageModule } from '@infrastructure/storage/storage.module';
import { InfrastructureAppSettingsModule } from '@infrastructure/app-settings/app-settings.module';
import { UploadMediaUseCase } from './use-cases/upload-media.use-case';
import { TestStorageConnectionUseCase } from './use-cases/test-storage.use-case';

const useCases = [UploadMediaUseCase, TestStorageConnectionUseCase];

@Module({
  // Infra storage provides `IStorageService`; app-settings infra provides the
  // per-tenant `IAppSettingsRepository` the use-cases read the config from.
  imports: [InfrastructureStorageModule, InfrastructureAppSettingsModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationStorageModule {}
