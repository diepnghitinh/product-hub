import { Module } from '@nestjs/common';
import { InfrastructureIssueLinksModule } from '@infrastructure/issue-links/issue-links.module';
import { InfrastructureTasksModule } from '@infrastructure/tasks/tasks.module';
import { InfrastructureBugsModule } from '@infrastructure/bugs/bugs.module';
import {
  CreateIssueLinkUseCase,
  DeleteIssueLinkUseCase,
  GetIssueLinksUseCase,
} from './use-cases';

const useCases = [CreateIssueLinkUseCase, GetIssueLinksUseCase, DeleteIssueLinkUseCase];

@Module({
  // Tasks + Bugs infra are imported to resolve linked issues (title/shortId/status)
  // and to validate a link's endpoints belong to the tenant.
  imports: [InfrastructureIssueLinksModule, InfrastructureTasksModule, InfrastructureBugsModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationIssueLinksModule {}
