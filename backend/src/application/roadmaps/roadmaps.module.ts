import { Module } from '@nestjs/common';
import { InfrastructureRoadmapsModule } from '@infrastructure/roadmaps/roadmaps.module';
import { InfrastructureIntegrationsModule } from '@infrastructure/integrations/integrations.module';
import { InfrastructureIssuesModule } from '@infrastructure/issues/issues.module';
import { InfrastructureAppSettingsModule } from '@infrastructure/app-settings/app-settings.module';
import {
  GetRoadmapTemplatesUseCase,
  ReplaceRoadmapTemplatesUseCase,
} from './use-cases/roadmap-template.use-cases';
import {
  CreateRoadmapUseCase,
  GetRoadmapsUseCase,
  GetRoadmapUseCase,
  UpdateRoadmapUseCase,
  ReplaceRoadmapItemsUseCase,
  AddRoadmapItemUseCase,
  ReplaceRoadmapColumnsUseCase,
  ReplaceRoadmapEpicsUseCase,
  DeleteRoadmapUseCase,
  SetRoadmapSharingUseCase,
  GetPublicRoadmapUseCase,
} from './use-cases/roadmap.use-cases';

const useCases = [
  CreateRoadmapUseCase,
  GetRoadmapsUseCase,
  GetRoadmapUseCase,
  UpdateRoadmapUseCase,
  ReplaceRoadmapItemsUseCase,
  AddRoadmapItemUseCase,
  ReplaceRoadmapColumnsUseCase,
  ReplaceRoadmapEpicsUseCase,
  DeleteRoadmapUseCase,
  SetRoadmapSharingUseCase,
  GetPublicRoadmapUseCase,
  GetRoadmapTemplatesUseCase,
  ReplaceRoadmapTemplatesUseCase,
];

@Module({
  // Integrations for `IClickUpSync` and issues for `IIssueRepository` — both the
  // infrastructure modules, not the application ones, to avoid a cycle (the
  // issues application module doesn't reach back into roadmaps).
  // App-settings for `IAppSettingsRepository`: the workspace's column templates
  // live on that singleton, and resolving a roadmap's columns needs them.
  imports: [
    InfrastructureRoadmapsModule,
    InfrastructureIntegrationsModule,
    InfrastructureIssuesModule,
    InfrastructureAppSettingsModule,
  ],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationRoadmapsModule {}
