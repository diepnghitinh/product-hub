import { Module } from '@nestjs/common';
import { ApplicationActivityModule } from '@application/activity/activity.module';
import { IssueActivityController } from './issue-activity.controller';
import { RoadmapItemActivityController } from './roadmap-item-activity.controller';

@Module({
  imports: [ApplicationActivityModule],
  controllers: [IssueActivityController, RoadmapItemActivityController],
})
export class ActivityPresentationModule {}
