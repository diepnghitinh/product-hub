import { Module } from '@nestjs/common';
import { InfrastructureMilestonesModule } from '@infrastructure/milestones/milestones.module';
import {
  CreateMilestoneUseCase,
  GetMilestonesUseCase,
  GetMilestoneUseCase,
  UpdateMilestoneUseCase,
  ReplaceObjectivesUseCase,
  DeleteMilestoneUseCase,
} from './use-cases/milestone.use-cases';

const useCases = [
  CreateMilestoneUseCase,
  GetMilestonesUseCase,
  GetMilestoneUseCase,
  UpdateMilestoneUseCase,
  ReplaceObjectivesUseCase,
  DeleteMilestoneUseCase,
];

@Module({
  imports: [InfrastructureMilestonesModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationMilestonesModule {}
