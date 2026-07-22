import { Module } from '@nestjs/common';
import { InfrastructureIssueLinksModule } from '@infrastructure/issue-links/issue-links.module';
import { InfrastructureIssuesModule } from '@infrastructure/issues/issues.module';
import {
  CreateIssueLinkUseCase,
  DeleteIssueLinkUseCase,
  GetIssueLinksUseCase,
} from './use-cases';

const useCases = [CreateIssueLinkUseCase, GetIssueLinksUseCase, DeleteIssueLinkUseCase];

@Module({
  // Issues infra resolves linked issues (title/shortId/status) and validates a
  // link's endpoints belong to the tenant — one collection for both kinds.
  imports: [InfrastructureIssueLinksModule, InfrastructureIssuesModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationIssueLinksModule {}
