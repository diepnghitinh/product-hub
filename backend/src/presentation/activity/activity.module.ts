import { Module } from '@nestjs/common';
import { ApplicationActivityModule } from '@application/activity/activity.module';
import { ActivityController } from './activity.controller';
import { TaskActivityController } from './task-activity.controller';

@Module({
  imports: [ApplicationActivityModule],
  controllers: [ActivityController, TaskActivityController],
})
export class ActivityPresentationModule {}
