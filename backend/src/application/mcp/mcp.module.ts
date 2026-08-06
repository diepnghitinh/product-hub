import { Module } from '@nestjs/common';
import { InfrastructureMcpModule } from '@infrastructure/mcp/mcp.module';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
import { ApplicationIssuesModule } from '@application/issues/issues.module';
import { ApplicationTeamsModule } from '@application/teams/teams.module';
import { ApplicationRoadmapsModule } from '@application/roadmaps/roadmaps.module';
import { ApplicationDocsModule } from '@application/docs/docs.module';
import {
  GetMcpContextUseCase,
  GetMcpEventsUseCase,
  McpCreateBacklogItemUseCase,
  McpCreateDocUseCase,
  McpCreateIssueUseCase,
  McpGetBacklogItemUseCase,
  McpGetIssueUseCase,
  McpSearchIssuesUseCase,
} from './use-cases';

const useCases = [
  GetMcpContextUseCase,
  GetMcpEventsUseCase,
  McpCreateBacklogItemUseCase,
  McpCreateDocUseCase,
  McpCreateIssueUseCase,
  McpGetBacklogItemUseCase,
  McpGetIssueUseCase,
  McpSearchIssuesUseCase,
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
  ],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationMcpModule {}
