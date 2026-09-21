import { Module } from '@nestjs/common';
import { InfrastructureMcpModule } from '@infrastructure/mcp/mcp.module';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
import { ApplicationIssuesModule } from '@application/issues/issues.module';
import { ApplicationTeamsModule } from '@application/teams/teams.module';
import { ApplicationRoadmapsModule } from '@application/roadmaps/roadmaps.module';
import { ApplicationDocsModule } from '@application/docs/docs.module';
import { ApplicationProjectsModule } from '@application/projects/projects.module';
import { ApplicationReportsModule } from '@application/reports/reports.module';
import { ApplicationActivityModule } from '@application/activity/activity.module';
import { ApplicationStorageModule } from '@application/storage/storage.module';
import {
  GetMcpContextUseCase,
  GetMcpEventsUseCase,
  McpAddBacklogItemAttachmentUseCase,
  McpAddBacklogItemCommentUseCase,
  McpAddTestCasesUseCase,
  McpCreateBacklogItemUseCase,
  McpCreateDocPageUseCase,
  McpCreateDocUseCase,
  McpCreateIssueUseCase,
  McpGetBacklogItemUseCase,
  McpGetIssueUseCase,
  McpGetTestCasesUseCase,
  McpListDocsUseCase,
  McpListTestFeaturesUseCase,
  McpSearchIssuesUseCase,
  McpSetTestCaseResultUseCase,
  McpUpdateBacklogItemStatusUseCase,
} from './use-cases';

const useCases = [
  GetMcpContextUseCase,
  GetMcpEventsUseCase,
  McpAddBacklogItemAttachmentUseCase,
  McpAddBacklogItemCommentUseCase,
  McpAddTestCasesUseCase,
  McpCreateBacklogItemUseCase,
  McpCreateDocPageUseCase,
  McpCreateDocUseCase,
  McpCreateIssueUseCase,
  McpGetBacklogItemUseCase,
  McpGetIssueUseCase,
  McpGetTestCasesUseCase,
  McpListDocsUseCase,
  McpListTestFeaturesUseCase,
  McpSearchIssuesUseCase,
  McpSetTestCaseResultUseCase,
  McpUpdateBacklogItemStatusUseCase,
];

@Module({
  // MCP writes through the same use-cases the app does — it resolves names to
  // ids (teams, people, roadmaps, projects, features) and then delegates, so a
  // tool call and a click produce identical records.
  imports: [
    InfrastructureMcpModule,
    InfrastructureUsersModule,
    ApplicationIssuesModule,
    ApplicationTeamsModule,
    ApplicationRoadmapsModule,
    ApplicationDocsModule,
    ApplicationProjectsModule,
    ApplicationReportsModule,
    // For CreateRoadmapItemCommentUseCase — add_backlog_item_comment delegates
    // to it rather than writing the Comment collection a second way.
    ApplicationActivityModule,
    // For UploadMediaUseCase — add_backlog_item_attachment stores through the
    // same pipeline the app's own uploader uses, tenant caps included.
    ApplicationStorageModule,
  ],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationMcpModule {}
