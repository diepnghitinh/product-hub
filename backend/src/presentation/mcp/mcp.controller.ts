import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Public } from '@core/decorators';
import { ValidationException } from '@core/exceptions';
import { MCP_CLIENT_HEADER, UNKNOWN_MCP_CLIENT } from '@application/mcp/domain/enums/mcp.enums';
import {
  McpCreateBacklogItemDto,
  McpCreateDocDto,
  McpCreateIssueDto,
  McpSearchIssuesDto,
} from '@application/mcp/dtos/mcp.dtos';
import {
  McpBacklogItemResponseDto,
  McpContextResponseDto,
  McpDocResponseDto,
  McpIssueResponseDto,
} from '@application/mcp/dtos/mcp.response.dto';
import {
  GetMcpContextUseCase,
  McpActor,
  McpCreateBacklogItemUseCase,
  McpCreateDocUseCase,
  McpCreateIssueUseCase,
  McpGetBacklogItemUseCase,
  McpGetIssueUseCase,
  McpSearchIssuesUseCase,
} from '@application/mcp/use-cases';
import { ApiAuth, ApiKeyGuard } from '@presentation/api-keys/api-key.guard';

type McpRequest = { apiAuth: ApiAuth; headers: Record<string, string | undefined> };

/**
 * The surface the MCP server calls — authenticated by `x-api-key`, not JWT, so
 * an assistant running on the user's machine can reach it without a browser
 * session. Writes go through the app's own use-cases and are attributed to the
 * key's owner; every create is also recorded in the MCP history (`GET
 * /mcp/events`) so the workspace can see what a robot added.
 *
 * References accept names, not just ids ("QC", "Next"), because that is what the
 * assistant has to work with. An unresolvable name is a 400 listing the valid
 * choices — never a quiet fallback that files the item somewhere else.
 */
@ApiTags('MCP')
@ApiSecurity('api-key')
@Public()
@UseGuards(ApiKeyGuard)
@Controller('mcp')
export class McpController {
  constructor(
    private readonly getContext: GetMcpContextUseCase,
    private readonly createIssue: McpCreateIssueUseCase,
    private readonly createBacklogItem: McpCreateBacklogItemUseCase,
    private readonly createDoc: McpCreateDocUseCase,
    private readonly searchIssues: McpSearchIssuesUseCase,
    private readonly getIssue: McpGetIssueUseCase,
    private readonly getBacklogItem: McpGetBacklogItemUseCase,
  ) {}

  @Get('context')
  @ApiOperation({ summary: 'Teams, statuses, roadmaps and people this key can file into' })
  async context(@Req() req: McpRequest): Promise<McpContextResponseDto> {
    const result = await this.getContext.execute({ actor: actorOf(req) });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Post('issues')
  @ApiOperation({ summary: 'Create a task or bug (API key)' })
  async create(
    @Req() req: McpRequest,
    @Body() dto: McpCreateIssueDto,
  ): Promise<McpIssueResponseDto> {
    const result = await this.createIssue.execute({ actor: actorOf(req), dto });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Post('backlog-items')
  @ApiOperation({ summary: 'Add an item to a roadmap backlog (API key)' })
  async addBacklogItem(
    @Req() req: McpRequest,
    @Body() dto: McpCreateBacklogItemDto,
  ): Promise<McpBacklogItemResponseDto> {
    const result = await this.createBacklogItem.execute({ actor: actorOf(req), dto });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Post('docs')
  @ApiOperation({ summary: 'Write a doc, body included (API key)' })
  async addDoc(@Req() req: McpRequest, @Body() dto: McpCreateDocDto): Promise<McpDocResponseDto> {
    const result = await this.createDoc.execute({ actor: actorOf(req), dto });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Get('issues')
  @ApiOperation({ summary: 'Search issues — check for a duplicate before creating' })
  async search(
    @Req() req: McpRequest,
    @Query() query: McpSearchIssuesDto,
  ): Promise<McpIssueResponseDto[]> {
    const result = await this.searchIssues.execute({ actor: actorOf(req), dto: query });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  // Declared after `GET issues` so the search route keeps the bare path; the ref
  // is a path segment because it is the whole request — this reads one issue.
  @Get('issues/:ref')
  @ApiOperation({ summary: 'Read one issue in full, description included' })
  async issue(@Req() req: McpRequest, @Param('ref') ref: string): Promise<McpIssueResponseDto> {
    const result = await this.getIssue.execute({ actor: actorOf(req), dto: { ref } });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Get('backlog-items/:ref')
  @ApiOperation({ summary: 'Read one backlog item in full, by ref or exact title' })
  async backlogItem(
    @Req() req: McpRequest,
    @Param('ref') ref: string,
  ): Promise<McpBacklogItemResponseDto> {
    const result = await this.getBacklogItem.execute({ actor: actorOf(req), dto: { ref } });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }
}

/** The key, plus whichever client the MCP server says it is speaking for. */
function actorOf(req: McpRequest): McpActor {
  const { tenantId, name, keyId, userId } = req.apiAuth;
  return {
    tenantId,
    keyId,
    keyName: name,
    userId,
    clientName: req.headers[MCP_CLIENT_HEADER]?.slice(0, 80) || UNKNOWN_MCP_CLIENT,
  };
}
