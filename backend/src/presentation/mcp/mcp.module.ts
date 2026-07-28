import { Module } from '@nestjs/common';
import { ApplicationApiKeysModule } from '@application/api-keys/api-keys.module';
import { ApplicationMcpModule } from '@application/mcp/mcp.module';
import { ApiKeyGuard } from '@presentation/api-keys/api-key.guard';
import { McpController } from './mcp.controller';
import { McpEventsController } from './mcp-events.controller';
import { McpHttpController } from './mcp-http.controller';
import { McpServerFactory } from './mcp-server.factory';
import { McpSessionRegistry } from './mcp-session.registry';

@Module({
  // ApiKeys for the guard on the tool routes; the events route is plain JWT.
  imports: [ApplicationApiKeysModule, ApplicationMcpModule],
  // `McpHttpController` is the MCP endpoint an assistant registers (`/v1/mcp`);
  // `McpController` is the plain REST shape of the same use-cases, kept because
  // it is the documented, scriptable surface and what the MCP tools call into.
  controllers: [McpHttpController, McpController, McpEventsController],
  providers: [ApiKeyGuard, McpServerFactory, McpSessionRegistry],
})
export class McpPresentationModule {}
