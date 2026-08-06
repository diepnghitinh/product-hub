import { Module } from '@nestjs/common';
import { ApplicationAppSettingsModule } from '@application/app-settings/app-settings.module';
import { ApplicationIssuesModule } from '@application/issues/issues.module';
import {
  DeleteIntegrationUseCase,
  RecordPipelineStateUseCase,
  RotateIntegrationSecretUseCase,
  SaveIntegrationUseCase,
} from './use-cases/integration.use-cases';

const useCases = [
  SaveIntegrationUseCase,
  RotateIntegrationSecretUseCase,
  DeleteIntegrationUseCase,
  RecordPipelineStateUseCase,
];

/**
 * Git integrations sit across two existing aggregates — the config lives on
 * app-settings, the state it produces lands on issues — so they get their own
 * module rather than being bolted onto either.
 */
@Module({
  imports: [ApplicationAppSettingsModule, ApplicationIssuesModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationIntegrationsModule {}
