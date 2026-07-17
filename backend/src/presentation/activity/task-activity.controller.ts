import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { EntityNotFoundException, ForbiddenDomainException } from '@core/exceptions';
import {
  GetTaskCommentsUseCase,
  CreateTaskCommentUseCase,
  UpdateTaskCommentUseCase,
  DeleteTaskCommentUseCase,
  COMMENT_FORBIDDEN,
  COMMENT_DELETE_FORBIDDEN,
} from '@application/activity/use-cases';
import { CreateCommentDto } from '@application/activity/dtos/create-comment.dto';
import { UpdateCommentDto } from '@application/activity/dtos/update-comment.dto';
import { CommentResponseDto } from '@application/activity/dtos/comment.response.dto';
import { CommentMapper } from '@application/activity/mappers';

@ApiTags('Activity')
@ApiBearerAuth('JWT-auth')
@Controller('tasks/:taskId/comments')
export class TaskActivityController {
  constructor(
    private readonly getComments: GetTaskCommentsUseCase,
    private readonly createComment: CreateTaskCommentUseCase,
    private readonly updateComment: UpdateTaskCommentUseCase,
    private readonly deleteComment: DeleteTaskCommentUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List a task’s activity (comments)' })
  async list(
    @AuthUser() auth: JwtPayload,
    @Param('taskId') taskId: string,
  ): Promise<CommentResponseDto[]> {
    const result = await this.getComments.execute({ tenantId: auth.tenantId, taskId });
    return CommentMapper.toResponseDtoArray(result.getValue());
  }

  @Post()
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Add a task comment' })
  async create(
    @AuthUser() auth: JwtPayload,
    @Param('taskId') taskId: string,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentResponseDto> {
    const result = await this.createComment.execute({
      tenantId: auth.tenantId,
      taskId,
      authorId: auth.userId,
      authorName: auth.name,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return CommentMapper.toResponseDto(result.getValue());
  }

  @Patch(':commentId')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Edit a task comment (author or admin)' })
  async update(
    @AuthUser() auth: JwtPayload,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
  ): Promise<CommentResponseDto> {
    const result = await this.updateComment.execute({
      tenantId: auth.tenantId,
      taskId,
      commentId,
      userId: auth.userId,
      role: auth.role,
      dto,
    });
    if (result.isFailure) {
      const msg = result.error as string;
      if (msg === COMMENT_FORBIDDEN) throw new ForbiddenDomainException(msg);
      throw new EntityNotFoundException(msg);
    }
    return CommentMapper.toResponseDto(result.getValue());
  }

  @Delete(':commentId')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Delete a task comment (author or admin)' })
  async remove(
    @AuthUser() auth: JwtPayload,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
  ): Promise<{ ok: true }> {
    const result = await this.deleteComment.execute({
      tenantId: auth.tenantId,
      taskId,
      commentId,
      userId: auth.userId,
      role: auth.role,
    });
    if (result.isFailure) {
      const msg = result.error as string;
      if (msg === COMMENT_DELETE_FORBIDDEN) throw new ForbiddenDomainException(msg);
      throw new EntityNotFoundException(msg);
    }
    return { ok: true };
  }
}
