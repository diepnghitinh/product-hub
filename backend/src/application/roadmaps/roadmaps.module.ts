import { Module } from '@nestjs/common';
import { InfrastructureRoadmapsModule } from '@infrastructure/roadmaps/roadmaps.module';
import {
  CreateRoadmapUseCase,
  GetRoadmapsUseCase,
  GetRoadmapUseCase,
  UpdateRoadmapUseCase,
  ReplaceRoadmapItemsUseCase,
  DeleteRoadmapUseCase,
} from './use-cases/roadmap.use-cases';

const useCases = [
  CreateRoadmapUseCase,
  GetRoadmapsUseCase,
  GetRoadmapUseCase,
  UpdateRoadmapUseCase,
  ReplaceRoadmapItemsUseCase,
  DeleteRoadmapUseCase,
];

@Module({
  imports: [InfrastructureRoadmapsModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationRoadmapsModule {}
