import { Module } from '@nestjs/common';
import { InfrastructureRoadmapsModule } from '@infrastructure/roadmaps/roadmaps.module';
import { InfrastructureIntegrationsModule } from '@infrastructure/integrations/integrations.module';
import { InfrastructureIssuesModule } from '@infrastructure/issues/issues.module';
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
];

@Module({
  // Integrations for `IClickUpSync` and issues for `IIssueRepository` — both the
  // infrastructure modules, not the application ones, to avoid a cycle (the
  // issues application module doesn't reach back into roadmaps).
  imports: [InfrastructureRoadmapsModule, InfrastructureIntegrationsModule, InfrastructureIssuesModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationRoadmapsModule {}
