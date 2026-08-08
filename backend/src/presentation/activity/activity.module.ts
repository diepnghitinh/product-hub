import { Module } from '@nestjs/common';
import { ApplicationActivityModule } from '@application/activity/activity.module';
import { ApplicationDocsModule } from '@application/docs/docs.module';
import { DocActivityController } from './doc-activity.controller';
import { IssueActivityController } from './issue-activity.controller';
import { RoadmapItemActivityController } from './roadmap-item-activity.controller';

@Module({
  // The docs slice comes in for `DocReadableGuard` alone — comments on a doc
  // hang off `docs/:docId`, so they answer to that doc's privacy. It's a leaf
  // importing an application module, so there's no cycle back to activity.
  imports: [ApplicationActivityModule, ApplicationDocsModule],
  controllers: [IssueActivityController, RoadmapItemActivityController, DocActivityController],
})
export class ActivityPresentationModule {}
