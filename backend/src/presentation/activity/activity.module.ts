import { Module } from '@nestjs/common';
import { ApplicationActivityModule } from '@application/activity/activity.module';
import { ActivityController } from './activity.controller';
import { TaskActivityController } from './task-activity.controller';
import { RoadmapItemActivityController } from './roadmap-item-activity.controller';

@Module({
  imports: [ApplicationActivityModule],
  controllers: [ActivityController, TaskActivityController, RoadmapItemActivityController],
})
export class ActivityPresentationModule {}
