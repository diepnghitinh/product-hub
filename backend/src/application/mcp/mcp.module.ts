import { Module } from '@nestjs/common';
import { InfrastructureMcpModule } from '@infrastructure/mcp/mcp.module';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
import { ApplicationIssuesModule } from '@application/issues/issues.module';
import { ApplicationTeamsModule } from '@application/teams/teams.module';
import { ApplicationRoadmapsModule } from '@application/roadmaps/roadmaps.module';
import { ApplicationDocsModule } from '@application/docs/docs.module';
import { ApplicationProjectsModule } from '@application/projects/projects.module';
import { ApplicationReportsModule } from '@application/reports/reports.module';
import {
  GetMcpContextUseCase,
  GetMcpEventsUseCase,
  McpAddTestCasesUseCase,
  McpCreateBacklogItemUseCase,
  McpCreateDocUseCase,
  McpCreateIssueUseCase,
  McpGetBacklogItemUseCase,
  McpGetIssueUseCase,
  McpGetTestCasesUseCase,
  McpListTestFeaturesUseCase,
  McpSearchIssuesUseCase,
  McpSetTestCaseResultUseCase,
} from './use-cases';

const useCases = [
  GetMcpContextUseCase,
  GetMcpEventsUseCase,
  McpAddTestCasesUseCase,
  McpCreateBacklogItemUseCase,
  McpCreateDocUseCase,
  McpCreateIssueUseCase,
  McpGetBacklogItemUseCase,
  McpGetIssueUseCase,
  McpGetTestCasesUseCase,
  McpListTestFeaturesUseCase,
  McpSearchIssuesUseCase,
  McpSetTestCaseResultUseCase,
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
  ],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationMcpModule {}
