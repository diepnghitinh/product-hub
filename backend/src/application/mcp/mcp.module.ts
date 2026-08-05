import { Module } from '@nestjs/common';
import { InfrastructureMcpModule } from '@infrastructure/mcp/mcp.module';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
import { InfrastructureProjectsModule } from '@infrastructure/projects/projects.module';
import { ApplicationIssuesModule } from '@application/issues/issues.module';
import { ApplicationTeamsModule } from '@application/teams/teams.module';
import { ApplicationRoadmapsModule } from '@application/roadmaps/roadmaps.module';
import { ApplicationDocsModule } from '@application/docs/docs.module';
import { ApplicationActivityModule } from '@application/activity/activity.module';
import { ApplicationIssueLinksModule } from '@application/issue-links/issue-links.module';
import { ApplicationCyclesModule } from '@application/cycles/cycles.module';
import {
  GetMcpContextUseCase,
  GetMcpEventsUseCase,
  McpAddCommentUseCase,
  McpCreateBacklogItemUseCase,
  McpCreateDocUseCase,
  McpCreateIssueUseCase,
  McpDeleteCommentUseCase,
  McpDeleteIssueUseCase,
  McpGetBugStatsUseCase,
  McpGetCycleBurndownUseCase,
  McpGetIssueUseCase,
  McpGetTeamVelocityUseCase,
  McpLinkIssuesUseCase,
  McpListBacklogItemsUseCase,
  McpListCommentsUseCase,
  McpListCyclesUseCase,
  McpListLinksUseCase,
  McpSearchIssuesUseCase,
  McpSetStatusUseCase,
  McpUnlinkIssuesUseCase,
  McpUpdateCommentUseCase,
  McpUpdateDocUseCase,
  McpUpdateIssueUseCase,
} from './use-cases';

const useCases = [
  GetMcpContextUseCase,
  GetMcpEventsUseCase,
  McpCreateBacklogItemUseCase,
  McpCreateDocUseCase,
  McpUpdateDocUseCase,
  McpCreateIssueUseCase,
  McpGetIssueUseCase,
  McpUpdateIssueUseCase,
  McpSetStatusUseCase,
  McpDeleteIssueUseCase,
  McpListCommentsUseCase,
  McpAddCommentUseCase,
  McpUpdateCommentUseCase,
  McpDeleteCommentUseCase,
  McpSearchIssuesUseCase,
  McpListBacklogItemsUseCase,
  McpLinkIssuesUseCase,
  McpListLinksUseCase,
  McpUnlinkIssuesUseCase,
  McpListCyclesUseCase,
  McpGetCycleBurndownUseCase,
  McpGetTeamVelocityUseCase,
  McpGetBugStatsUseCase,
];

@Module({
  // MCP writes through the same use-cases the app does — it resolves names to
  // ids (teams, people, roadmaps) and then delegates, so a tool call and a click
  // produce identical records.
  imports: [
    InfrastructureMcpModule,
    InfrastructureUsersModule,
    ApplicationIssuesModule,
    ApplicationTeamsModule,
    ApplicationRoadmapsModule,
    ApplicationDocsModule,
    // The 4 issue-comment use-cases (list/add/update/delete) inject from here —
    // without it the comment wrappers can't resolve their dependencies.
    ApplicationActivityModule,
    // The 3 issue-link use-cases (create/get/delete) the link wrappers delegate to.
    ApplicationIssueLinksModule,
    // Ba tool analytics đọc sprint qua GetTeamCyclesUseCase / GetCycleBurndownUseCase.
    // An toàn về vòng lặp: ApplicationIssuesModule mới là bên import Cycles, MCP là lá.
    ApplicationCyclesModule,
    // get_bug_stats đổi projectId thành tên project. Lấy repository từ module
    // infrastructure vì ApplicationProjectsModule chỉ export use-case, không export
    // IProjectRepository.
    InfrastructureProjectsModule,
  ],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationMcpModule {}
