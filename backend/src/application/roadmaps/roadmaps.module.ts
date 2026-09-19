import { Module } from '@nestjs/common';
import { InfrastructureRoadmapsModule } from '@infrastructure/roadmaps/roadmaps.module';
import { InfrastructureIssuesModule } from '@infrastructure/issues/issues.module';
import { ApplicationAuditLogModule } from '@application/audit-log/audit-log.module';
import {
  CreateRoadmapUseCase,
  GetRoadmapsUseCase,
  GetRoadmapUseCase,
  UpdateRoadmapUseCase,
  ReplaceRoadmapItemsUseCase,
  AddRoadmapItemUseCase,
  ReplaceRoadmapColumnsUseCase,
  DeleteRoadmapUseCase,
  SetRoadmapSharingUseCase,
  GetPublicRoadmapUseCase,
} from './use-cases/roadmap.use-cases';
import { GetRoadmapProgressUseCase } from './use-cases/roadmap-progress.use-case';

const useCases = [
  CreateRoadmapUseCase,
  GetRoadmapsUseCase,
  GetRoadmapUseCase,
  UpdateRoadmapUseCase,
  ReplaceRoadmapItemsUseCase,
  AddRoadmapItemUseCase,
  ReplaceRoadmapColumnsUseCase,
  DeleteRoadmapUseCase,
  SetRoadmapSharingUseCase,
  GetPublicRoadmapUseCase,
  // Reads the issues collection to derive each item's percent complete.
  GetRoadmapProgressUseCase,
];

@Module({
  imports: [InfrastructureRoadmapsModule, InfrastructureIssuesModule, ApplicationAuditLogModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationRoadmapsModule {}
