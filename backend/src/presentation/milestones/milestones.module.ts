import { Module } from '@nestjs/common';
import { ApplicationMilestonesModule } from '@application/milestones/milestones.module';
import { MilestonesController } from './milestones.controller';

@Module({
  imports: [ApplicationMilestonesModule],
  controllers: [MilestonesController],
})
export class MilestonesPresentationModule {}
