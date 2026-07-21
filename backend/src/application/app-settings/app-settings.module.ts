import { Module } from '@nestjs/common';
import { InfrastructureAppSettingsModule } from '@infrastructure/app-settings/app-settings.module';
import {
  GetAppSettingsUseCase,
  UpdateBugStatusesUseCase,
  UpdateStorageUseCase,
  UpdateTaskStatusesUseCase,
  UpdateWebhooksUseCase,
} from './use-cases/app-settings.use-cases';

const useCases = [
  GetAppSettingsUseCase,
  UpdateWebhooksUseCase,
  UpdateBugStatusesUseCase,
  UpdateTaskStatusesUseCase,
  UpdateStorageUseCase,
];

@Module({
  imports: [InfrastructureAppSettingsModule],
  providers: [...useCases],
  exports: [...useCases, InfrastructureAppSettingsModule],
})
export class ApplicationAppSettingsModule {}
