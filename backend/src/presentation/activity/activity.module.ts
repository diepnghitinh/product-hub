import { Module } from '@nestjs/common';
import { ApplicationActivityModule } from '@application/activity/activity.module';
import { DocActivityController } from './doc-activity.controller';
import { IssueActivityController } from './issue-activity.controller';
import { RoadmapItemActivityController } from './roadmap-item-activity.controller';

@Module({
  imports: [ApplicationActivityModule],
  controllers: [IssueActivityController, RoadmapItemActivityController, DocActivityController],
})
export class ActivityPresentationModule {}
