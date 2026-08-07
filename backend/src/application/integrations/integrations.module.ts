import { Module } from '@nestjs/common';
import { ApplicationAppSettingsModule } from '@application/app-settings/app-settings.module';
import { ApplicationIssuesModule } from '@application/issues/issues.module';
import { InfrastructureIntegrationsModule } from '@infrastructure/integrations/integrations.module';
import { InfrastructureRoadmapsModule } from '@infrastructure/roadmaps/roadmaps.module';
import { ClickUpClient } from './domain/clickup.client';
import {
  DeleteIntegrationUseCase,
  RecordPipelineStateUseCase,
  RotateIntegrationSecretUseCase,
  SaveIntegrationUseCase,
} from './use-cases/integration.use-cases';
import {
  ConnectClickUpUseCase,
  DisconnectClickUpUseCase,
  GetClickUpLinksUseCase,
  LinkClickUpTaskUseCase,
  ProbeClickUpUseCase,
  ReceiveClickUpEventUseCase,
  RefreshClickUpLinkUseCase,
  SetClickUpEnabledUseCase,
  UnlinkClickUpTaskUseCase,
} from './use-cases/clickup.use-cases';

const useCases = [
  SaveIntegrationUseCase,
  RotateIntegrationSecretUseCase,
  DeleteIntegrationUseCase,
  RecordPipelineStateUseCase,
  ProbeClickUpUseCase,
  ConnectClickUpUseCase,
  SetClickUpEnabledUseCase,
  DisconnectClickUpUseCase,
  GetClickUpLinksUseCase,
  LinkClickUpTaskUseCase,
  UnlinkClickUpTaskUseCase,
  RefreshClickUpLinkUseCase,
  ReceiveClickUpEventUseCase,
];

/**
 * Integrations sit across the aggregates they touch rather than inside any of
 * them — the config lives on app-settings, git state lands on issues, and a
 * ClickUp link can point at an issue or a roadmap item — so they get their own
 * module rather than being bolted onto one of the three.
 */
@Module({
  imports: [
    ApplicationAppSettingsModule,
    ApplicationIssuesModule,
    InfrastructureIntegrationsModule,
    // Only the repository port — a ClickUp link on a backlog item needs to check
    // the item exists, nothing more. `ApplicationRoadmapsModule` keeps its
    // infrastructure private, and there is no roadmap use-case to call here.
    InfrastructureRoadmapsModule,
  ],
  providers: [ClickUpClient, ...useCases],
  exports: [...useCases],
})
export class ApplicationIntegrationsModule {}
