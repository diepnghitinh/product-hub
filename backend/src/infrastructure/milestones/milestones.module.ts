import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IMilestoneRepository } from '@application/milestones/repositories/milestone.repository';
import { MilestoneSchema } from './entities/milestone.schema';
import { MilestoneRepository } from './repositories/milestone.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Milestone', schema: MilestoneSchema }])],
  providers: [{ provide: IMilestoneRepository, useClass: MilestoneRepository }],
  exports: [IMilestoneRepository],
})
export class InfrastructureMilestonesModule {}
