import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Public } from '@core/decorators';
import { ValidationException } from '@core/exceptions';
import { MCP_CLIENT_HEADER, UNKNOWN_MCP_CLIENT } from '@application/mcp/domain/enums/mcp.enums';
import {
  McpAddCommentDto,
  McpCreateBacklogItemDto,
  McpCreateDocDto,
  McpCreateIssueDto,
  McpLinkIssuesDto,
  McpListBacklogItemsDto,
  McpSearchIssuesDto,
  McpSetStatusDto,
  McpUpdateCommentDto,
  McpUpdateDocDto,
  McpUpdateIssueDto,
} from '@application/mcp/dtos/mcp.dtos';
import {
  McpBugStatsDto,
  McpCycleBurndownDto,
  McpListCyclesDto,
  McpTeamVelocityDto,
} from '@application/mcp/dtos/mcp-analytics.dtos';
import { CycleBurndownResponseDto } from '@application/cycles/dtos/cycle.dtos';
import {
  McpBacklogItemBriefDto,
  McpBacklogItemResponseDto,
  McpCommentDto,
  McpCommentResultDto,
  McpContextResponseDto,
  McpDeletedCommentResponseDto,
  McpDeletedIssueResponseDto,
  McpDocResponseDto,
  McpIssueDetailResponseDto,
  McpIssueLinkDto,
  McpIssueResponseDto,
  McpLinkResultDto,
  McpUnlinkResultDto,
  McpUpdatedDocResponseDto,
} from '@application/mcp/dtos/mcp.response.dto';
import {
  McpBugStatsResponseDto,
  McpCycleSummaryDto,
  McpVelocityResponseDto,
} from '@application/mcp/dtos/mcp-analytics.response.dto';
import {
  GetMcpContextUseCase,
  McpActor,
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
} from '@application/mcp/use-cases';
import { ApiAuth, ApiKeyGuard } from '@presentation/api-keys/api-key.guard';
import { assertCanDelete, assertCanWrite } from './mcp-scope';

type McpRequest = { apiAuth: ApiAuth; headers: Record<string, string | undefined> };

/** The REST mirror is an equal write path to the MCP tools, so it enforces the
 *  same scope gate — a read-only key is refused here too, not just over JSON-RPC. */
function guardWrite(actor: McpActor): void {
  const gate = assertCanWrite(actor);
  if (gate.isFailure) throw new ValidationException(gate.error as string);
}

/** The delete counterpart — a destructive route needs the higher delete scope. */
function guardDelete(actor: McpActor): void {
  const gate = assertCanDelete(actor);
  if (gate.isFailure) throw new ValidationException(gate.error as string);
}

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
    private readonly getIssue: McpGetIssueUseCase,
    private readonly updateIssue: McpUpdateIssueUseCase,
    private readonly setStatus: McpSetStatusUseCase,
    private readonly deleteIssue: McpDeleteIssueUseCase,
    private readonly listComments: McpListCommentsUseCase,
    private readonly addComment: McpAddCommentUseCase,
    private readonly updateComment: McpUpdateCommentUseCase,
    private readonly deleteComment: McpDeleteCommentUseCase,
    private readonly createBacklogItem: McpCreateBacklogItemUseCase,
    private readonly createDoc: McpCreateDocUseCase,
    private readonly updateDoc: McpUpdateDocUseCase,
    private readonly searchIssues: McpSearchIssuesUseCase,
    private readonly listBacklogItems: McpListBacklogItemsUseCase,
    private readonly linkIssues: McpLinkIssuesUseCase,
    private readonly listLinks: McpListLinksUseCase,
    private readonly unlinkIssues: McpUnlinkIssuesUseCase,
    private readonly listCycles: McpListCyclesUseCase,
    private readonly cycleBurndown: McpGetCycleBurndownUseCase,
    private readonly velocity: McpGetTeamVelocityUseCase,
    private readonly bugStats: McpGetBugStatsUseCase,
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
    const actor = actorOf(req);
    guardWrite(actor);
    const result = await this.createIssue.execute({ actor, dto });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Post('backlog-items')
  @ApiOperation({ summary: 'Add an item to a roadmap backlog (API key)' })
  async addBacklogItem(
    @Req() req: McpRequest,
    @Body() dto: McpCreateBacklogItemDto,
  ): Promise<McpBacklogItemResponseDto> {
    const actor = actorOf(req);
    guardWrite(actor);
    const result = await this.createBacklogItem.execute({ actor, dto });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Get('backlog-items')
  @ApiOperation({ summary: 'Browse roadmap backlog items — ref, RICE, status (API key)' })
  async backlogItems(
    @Req() req: McpRequest,
    @Query() query: McpListBacklogItemsDto,
  ): Promise<McpBacklogItemBriefDto[]> {
    const result = await this.listBacklogItems.execute({ actor: actorOf(req), dto: query });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Get('cycles')
  @ApiOperation({ summary: 'A team’s sprints — dates, status, goal, rollups (API key)' })
  async cycles(
    @Req() req: McpRequest,
    @Query() query: McpListCyclesDto,
  ): Promise<McpCycleSummaryDto[]> {
    const result = await this.listCycles.execute({ actor: actorOf(req), dto: query });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Get('cycles/:cycle/burndown')
  @ApiOperation({ summary: 'One sprint’s burn-up series and breakdowns (API key)' })
  async cycleBurndownRoute(
    @Req() req: McpRequest,
    @Param('cycle') cycle: string,
    @Query('team') team: string,
  ): Promise<CycleBurndownResponseDto> {
    const result = await this.cycleBurndown.execute({ actor: actorOf(req), dto: { team, cycle } });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Get('velocity')
  @ApiOperation({ summary: 'A team’s velocity across recent completed sprints (API key)' })
  async velocityRoute(
    @Req() req: McpRequest,
    @Query() query: McpTeamVelocityDto,
  ): Promise<McpVelocityResponseDto> {
    const result = await this.velocity.execute({ actor: actorOf(req), dto: query });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Get('bug-stats')
  @ApiOperation({ summary: 'Bug distribution by dimension, plus opened/closed flow (API key)' })
  async bugStatsRoute(
    @Req() req: McpRequest,
    @Query() query: McpBugStatsDto,
  ): Promise<McpBugStatsResponseDto> {
    // `McpBugStatsDto.groupBy` normalizes a lone `?groupBy=status` into an array
    // via `@Transform` before `@IsArray()` runs, so `query.groupBy` is already an
    // array (or undefined) here — no further normalization needed.
    const result = await this.bugStats.execute({ actor: actorOf(req), dto: query });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Post('docs')
  @ApiOperation({ summary: 'Write a doc, body included (API key)' })
  async addDoc(@Req() req: McpRequest, @Body() dto: McpCreateDocDto): Promise<McpDocResponseDto> {
    const actor = actorOf(req);
    guardWrite(actor);
    const result = await this.createDoc.execute({ actor, dto });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Patch('docs/:doc')
  @ApiOperation({ summary: 'Edit a doc — title/tags, a page body, or append a page (API key)' })
  async editDoc(
    @Req() req: McpRequest,
    @Param('doc') doc: string,
    @Body() dto: McpUpdateDocDto,
  ): Promise<McpUpdatedDocResponseDto> {
    const actor = actorOf(req);
    guardWrite(actor);
    const result = await this.updateDoc.execute({ actor, dto: { ...dto, doc } });
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

  @Get('issues/:issue')
  @ApiOperation({ summary: 'Read one issue in full, with its subtasks (API key)' })
  async getOne(
    @Req() req: McpRequest,
    @Param('issue') issue: string,
  ): Promise<McpIssueDetailResponseDto> {
    const result = await this.getIssue.execute({ actor: actorOf(req), dto: { issue } });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Patch('issues/:issue')
  @ApiOperation({ summary: 'Update a task or bug — labels/assignee replace the set (API key)' })
  async update(
    @Req() req: McpRequest,
    @Param('issue') issue: string,
    @Body() dto: McpUpdateIssueDto,
  ): Promise<McpIssueResponseDto> {
    const actor = actorOf(req);
    guardWrite(actor);
    const result = await this.updateIssue.execute({ actor, dto: { ...dto, issue } });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Patch('issues/:issue/status')
  @ApiOperation({ summary: 'Move an issue to another status column (API key)' })
  async changeStatus(
    @Req() req: McpRequest,
    @Param('issue') issue: string,
    @Body() dto: McpSetStatusDto,
  ): Promise<McpIssueResponseDto> {
    const actor = actorOf(req);
    guardWrite(actor);
    const result = await this.setStatus.execute({ actor, dto: { ...dto, issue } });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Delete('issues/:issue')
  @ApiOperation({ summary: 'Delete an issue — refused while it has subtasks (API key)' })
  async remove(
    @Req() req: McpRequest,
    @Param('issue') issue: string,
  ): Promise<McpDeletedIssueResponseDto> {
    const actor = actorOf(req);
    guardDelete(actor);
    const result = await this.deleteIssue.execute({ actor, dto: { issue } });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Get('issues/:issue/comments')
  @ApiOperation({ summary: 'List an issue’s comment thread (API key)' })
  async comments(
    @Req() req: McpRequest,
    @Param('issue') issue: string,
  ): Promise<McpCommentDto[]> {
    const result = await this.listComments.execute({ actor: actorOf(req), dto: { issue } });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Post('issues/:issue/comments')
  @ApiOperation({ summary: 'Comment on an issue — mentions accept names (API key)' })
  async comment(
    @Req() req: McpRequest,
    @Param('issue') issue: string,
    @Body() dto: McpAddCommentDto,
  ): Promise<McpCommentResultDto> {
    const actor = actorOf(req);
    guardWrite(actor);
    const result = await this.addComment.execute({ actor, dto: { ...dto, issue } });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Patch('issues/:issue/comments/:comment')
  @ApiOperation({ summary: 'Edit a comment — author or admin/product only (API key)' })
  async editComment(
    @Req() req: McpRequest,
    @Param('issue') issue: string,
    @Param('comment') comment: string,
    @Body() dto: McpUpdateCommentDto,
  ): Promise<McpCommentResultDto> {
    const actor = actorOf(req);
    guardWrite(actor);
    const result = await this.updateComment.execute({ actor, dto: { ...dto, issue, comment } });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Delete('issues/:issue/comments/:comment')
  @ApiOperation({ summary: 'Delete a comment — author or admin/product only (API key)' })
  async removeComment(
    @Req() req: McpRequest,
    @Param('issue') issue: string,
    @Param('comment') comment: string,
  ): Promise<McpDeletedCommentResponseDto> {
    const actor = actorOf(req);
    guardDelete(actor);
    const result = await this.deleteComment.execute({ actor, dto: { issue, comment } });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Get('issues/:issue/links')
  @ApiOperation({ summary: 'List an issue’s relations — each with its link id (API key)' })
  async links(
    @Req() req: McpRequest,
    @Param('issue') issue: string,
  ): Promise<McpIssueLinkDto[]> {
    const result = await this.listLinks.execute({ actor: actorOf(req), dto: { issue } });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Post('links')
  @ApiOperation({ summary: 'Link two issues with a typed relation (API key)' })
  async link(@Req() req: McpRequest, @Body() dto: McpLinkIssuesDto): Promise<McpLinkResultDto> {
    const actor = actorOf(req);
    guardWrite(actor);
    const result = await this.linkIssues.execute({ actor, dto });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Delete('links/:link')
  @ApiOperation({ summary: 'Remove a relation by link id — write access only (API key)' })
  async unlink(
    @Req() req: McpRequest,
    @Param('link') link: string,
  ): Promise<McpUnlinkResultDto> {
    const actor = actorOf(req);
    guardWrite(actor);
    const result = await this.unlinkIssues.execute({ actor, dto: { link } });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }
}

/** The key, plus whichever client the MCP server says it is speaking for. */
function actorOf(req: McpRequest): McpActor {
  const { tenantId, name, keyId, userId, scope } = req.apiAuth;
  return {
    tenantId,
    keyId,
    keyName: name,
    userId,
    scope,
    clientName: req.headers[MCP_CLIENT_HEADER]?.slice(0, 80) || UNKNOWN_MCP_CLIENT,
  };
}
