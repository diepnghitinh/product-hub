import { Module } from '@nestjs/common';
import { InfrastructureActivityModule } from '@infrastructure/activity/activity.module';
import { InfrastructureIssuesModule } from '@infrastructure/issues/issues.module';
import { InfrastructureRoadmapsModule } from '@infrastructure/roadmaps/roadmaps.module';
import { InfrastructureDocsModule } from '@infrastructure/docs/docs.module';
import { InfrastructureWebhooksModule } from '@infrastructure/webhooks/webhooks.module';
import {
  GetIssueCommentsUseCase,
  CreateIssueCommentUseCase,
  UpdateIssueCommentUseCase,
  DeleteIssueCommentUseCase,
  GetRoadmapItemCommentsUseCase,
  CreateRoadmapItemCommentUseCase,
  UpdateRoadmapItemCommentUseCase,
  DeleteRoadmapItemCommentUseCase,
  GetDocCommentsUseCase,
  GetDocCommentCountsUseCase,
  CreateDocCommentUseCase,
  UpdateDocCommentUseCase,
  ResolveDocCommentUseCase,
  DeleteDocCommentUseCase,
} from './use-cases';

const useCases = [
  GetIssueCommentsUseCase,
  CreateIssueCommentUseCase,
  UpdateIssueCommentUseCase,
  DeleteIssueCommentUseCase,
  GetRoadmapItemCommentsUseCase,
  CreateRoadmapItemCommentUseCase,
  UpdateRoadmapItemCommentUseCase,
  DeleteRoadmapItemCommentUseCase,
  GetDocCommentsUseCase,
  GetDocCommentCountsUseCase,
  CreateDocCommentUseCase,
  UpdateDocCommentUseCase,
  ResolveDocCommentUseCase,
  DeleteDocCommentUseCase,
];

@Module({
  imports: [
    InfrastructureActivityModule,
    InfrastructureIssuesModule,
    InfrastructureRoadmapsModule,
    // Doc-page comments validate their page before writing. Infra-only, so this
    // doesn't cycle with ApplicationDocsModule reading comments back the other way.
    InfrastructureDocsModule,
    InfrastructureWebhooksModule,
  ],
  providers: [...useCases],
  // Re-export the comment infra so the inbox slice can read mentions.
  exports: [...useCases, InfrastructureActivityModule],
})
export class ApplicationActivityModule {}
