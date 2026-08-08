import { Module } from '@nestjs/common';
import { InfrastructureRoadmapsModule } from '@infrastructure/roadmaps/roadmaps.module';
import { InfrastructureIntegrationsModule } from '@infrastructure/integrations/integrations.module';
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
  // Integrations for `IClickUpSync` — the infrastructure module, not the
  // application one, which imports this side of the graph. See the port's doc.
  imports: [InfrastructureRoadmapsModule, InfrastructureIntegrationsModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationRoadmapsModule {}
