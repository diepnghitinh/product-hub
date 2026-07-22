import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@core/decorators';
import { EntityNotFoundException } from '@core/exceptions';
import { GetPublicTeamUseCase } from '@application/teams/use-cases/team.use-cases';
import { TeamMapper } from '@application/teams/mappers/team.mapper';
import { TeamResponseDto } from '@application/teams/dtos/team.dtos';
import { TeamIssueType } from '@application/teams/domain/enums/team.enums';
import { GetBugsUseCase } from '@application/bugs/use-cases/get-bugs.use-case';
import { GetBugUseCase } from '@application/bugs/use-cases/get-bug.use-case';
import { BugMapper } from '@application/bugs/mappers/bug.mapper';
import { BugResponseDto } from '@application/bugs/dtos/bug.response.dto';
import { QueryBugDto } from '@application/bugs/dtos/query-bug.dto';
import { GetTasksUseCase } from '@application/tasks/use-cases/get-tasks.use-case';
import { GetTaskUseCase } from '@application/tasks/use-cases/get-task.use-case';
import { TaskMapper } from '@application/tasks/mappers/task.mapper';
import { TaskResponseDto } from '@application/tasks/dtos/task.response.dto';
import { QueryTaskDto } from '@application/tasks/dtos/query-task.dto';
import { GetCommentsUseCase } from '@application/activity/use-cases/get-comments.use-case';
import { GetTaskCommentsUseCase } from '@application/activity/use-cases/task-comment.use-cases';
import { CommentMapper } from '@application/activity/mappers/comment.mapper';
import { CommentResponseDto } from '@application/activity/dtos/comment.response.dto';

interface PublicTeamBoardView {
  team: TeamResponseDto;
  issueType: TeamIssueType;
  items: (BugResponseDto | TaskResponseDto)[];
}

/**
 * Public read-only team board (no auth) resolved from a share token. A team is
 * typed BUG or TASK, so the board is that team's bug list or task list. The
 * board columns live on the team; comments are fetched lazily per card so the
 * board payload stays small.
 */
@ApiTags('Public API')
@Public()
@Controller('public/teams')
export class PublicTeamsController {
  constructor(
    private readonly getPublicTeam: GetPublicTeamUseCase,
    private readonly getBugs: GetBugsUseCase,
    private readonly getBug: GetBugUseCase,
    private readonly getTasks: GetTasksUseCase,
    private readonly getTask: GetTaskUseCase,
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

    let items: (BugResponseDto | TaskResponseDto)[];
    if (team.issueType === TeamIssueType.BUG) {
      const bugs = await this.getBugs.execute({ tenantId, query: { teamId } as QueryBugDto });
      items = BugMapper.toResponseDtoArray(bugs.getValue().data);
    } else {
      // Public boards only ever show a team's tasks. Empty requester keeps the
      // personal-task filter on (ownerId='') so a personal card can't leak here.
      const tasks = await this.getTasks.execute({ tenantId, userId: '', query: { teamId } as QueryTaskDto });
      items = TaskMapper.toResponseDtoArray(tasks.getValue().data);
    }
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

    // Verify the card actually belongs to the shared team, so a token can't be
    // used to read comments of other items in the same workspace.
    if (team.issueType === TeamIssueType.BUG) {
      const bug = await this.getBug.execute({ id: itemId, tenantId });
      if (bug.isFailure || BugMapper.toResponseDto(bug.getValue()).teamId !== teamId) throw gone();
      const comments = await this.getBugComments.execute({ tenantId, bugId: itemId });
      return CommentMapper.toResponseDtoArray(comments.getValue());
    }
    // isVisibleTo('', false) is true for a team task but false for a personal
    // one, so a personal ref can't be read through a shared team link.
    const task = await this.getTask.execute({ id: itemId, tenantId, requesterId: '', isAdmin: false });
    if (task.isFailure || TaskMapper.toResponseDto(task.getValue()).teamId !== teamId) throw gone();
    const comments = await this.getTaskComments.execute({ tenantId, taskId: itemId });
    return CommentMapper.toResponseDtoArray(comments.getValue());
  }
}
