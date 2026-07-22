import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@core/decorators';
import { EntityNotFoundException } from '@core/exceptions';
import { GetPublicTeamUseCase } from '@application/teams/use-cases/team.use-cases';
import { TeamMapper } from '@application/teams/mappers/team.mapper';
import { TeamResponseDto } from '@application/teams/dtos/team.dtos';
import { TeamIssueType } from '@application/teams/domain/enums/team.enums';
import { GetIssuesUseCase } from '@application/issues/use-cases/get-issues.use-case';
import { GetIssueUseCase } from '@application/issues/use-cases/get-issue.use-case';
import { IssueMapper } from '@application/issues/mappers/issue.mapper';
import { IssueResponseDto } from '@application/issues/dtos/issue.response.dto';
import { QueryIssueDto } from '@application/issues/dtos/query-issue.dto';
import { IssueKind } from '@application/issues/domain/enums/issue.enums';
import { GetCommentsUseCase } from '@application/activity/use-cases/get-comments.use-case';
import { GetTaskCommentsUseCase } from '@application/activity/use-cases/task-comment.use-cases';
import { CommentMapper } from '@application/activity/mappers/comment.mapper';
import { CommentResponseDto } from '@application/activity/dtos/comment.response.dto';

interface PublicTeamBoardView {
  team: TeamResponseDto;
  issueType: TeamIssueType;
  items: IssueResponseDto[];
}

/**
 * Public read-only team board (no auth) resolved from a share token. A team is
 * typed BUG or TASK, so the board is that team's bug list or task list — both
 * read from the unified `issues` collection, the same source the app itself
 * writes to, so a shared board never lags behind the live board. The board
 * columns live on the team; comments are fetched lazily per card so the board
 * payload stays small.
 */
@ApiTags('Public API')
@Public()
@Controller('public/teams')
export class PublicTeamsController {
  constructor(
    private readonly getPublicTeam: GetPublicTeamUseCase,
    private readonly getIssues: GetIssuesUseCase,
    private readonly getIssue: GetIssueUseCase,
    private readonly getBugComments: GetCommentsUseCase,
    private readonly getTaskComments: GetTaskCommentsUseCase,
  ) {}

  @Get(':token')
  @ApiOperation({ summary: 'Read-only team board (tasks or bugs) by share token' })
  async view(@Param('token') token: string): Promise<PublicTeamBoardView> {
    const result = await this.getPublicTeam.execute({ token });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    const team = result.getValue();
    const tenantId = team.tenantId;
    const teamId = team.id.toString();
    const kind = team.issueType === TeamIssueType.BUG ? IssueKind.BUG : IssueKind.TASK;

    // Empty userId leaves the personal-task filter on (ownerId '') so a private
    // card can't leak onto a shared board; `kind` scopes to the team's issue type.
    const issues = await this.getIssues.execute({
      tenantId,
      userId: '',
      query: { teamId, kind: [kind] } as QueryIssueDto,
    });
    const items = IssueMapper.toResponseDtoArray(issues.getValue().data);
    return { team: TeamMapper.toResponseDto(team), issueType: team.issueType, items };
  }

  @Get(':token/items/:itemId/comments')
  @ApiOperation({ summary: 'Read-only comments for a card on a shared team board' })
  async comments(
    @Param('token') token: string,
    @Param('itemId') itemId: string,
  ): Promise<CommentResponseDto[]> {
    const result = await this.getPublicTeam.execute({ token });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    const team = result.getValue();
    const tenantId = team.tenantId;
    const teamId = team.id.toString();
    const gone = () => new EntityNotFoundException('This link is not available');

    // Verify the card actually belongs to the shared team, so a token can't read
    // comments of other items in the same workspace. isVisibleTo('', false) is
    // true for a team task/bug but false for a personal task, so a personal ref
    // can't be read through a shared team link.
    const issue = await this.getIssue.execute({ id: itemId, tenantId, requesterId: '', isAdmin: false });
    if (issue.isFailure || IssueMapper.toResponseDto(issue.getValue()).teamId !== teamId) throw gone();

    // Comments are still stored per kind; a team is a single kind, so branch the fetch.
    if (team.issueType === TeamIssueType.BUG) {
      const comments = await this.getBugComments.execute({ tenantId, bugId: itemId });
      return CommentMapper.toResponseDtoArray(comments.getValue());
    }
    const comments = await this.getTaskComments.execute({ tenantId, taskId: itemId });
    return CommentMapper.toResponseDtoArray(comments.getValue());
  }
}
