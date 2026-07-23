import { Module } from '@nestjs/common';
import { InfrastructureIssuesModule } from '@infrastructure/issues/issues.module';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
import { InfrastructureTeamsModule } from '@infrastructure/teams/teams.module';
import { InfrastructureWebhooksModule } from '@infrastructure/webhooks/webhooks.module';
import { ApplicationCyclesModule } from '@application/cycles/cycles.module';
import {
  CreateIssueUseCase,
  GetIssuesUseCase,
  GetIssueUseCase,
  UpdateIssueUseCase,
  SetIssueStatusUseCase,
  DeleteIssueUseCase,
} from './use-cases';

const useCases = [
  CreateIssueUseCase,
  GetIssuesUseCase,
  GetIssueUseCase,
  UpdateIssueUseCase,
  SetIssueStatusUseCase,
  DeleteIssueUseCase,
];

@Module({
  // Issues resolve assignee names (users), land in the workspace's team for their
  // kind (teams), and fire the bug webhooks (notifier) on a bug create. Cycles:
  // list reads tick the lazy scheduler and updates validate a cycleId.
  imports: [
    InfrastructureIssuesModule,
    InfrastructureUsersModule,
    InfrastructureTeamsModule,
    InfrastructureWebhooksModule,
    ApplicationCyclesModule,
  ],
  providers: [...useCases],
  exports: [...useCases, InfrastructureIssuesModule],
})
export class ApplicationIssuesModule {}
