import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { EntityNotFoundException, ForbiddenDomainException } from '@core/exceptions';
import {
  GetCommentsUseCase,
  CreateCommentUseCase,
  UpdateCommentUseCase,
  DeleteCommentUseCase,
  COMMENT_FORBIDDEN,
  COMMENT_DELETE_FORBIDDEN,
} from '@application/activity/use-cases';
import { CreateCommentDto } from '@application/activity/dtos/create-comment.dto';
import { UpdateCommentDto } from '@application/activity/dtos/update-comment.dto';
import { CommentResponseDto } from '@application/activity/dtos/comment.response.dto';
import { CommentMapper } from '@application/activity/mappers';

@ApiTags('Activity')
@ApiBearerAuth('JWT-auth')
@Controller('bugs/:bugId/comments')
export class ActivityController {
  constructor(
    private readonly getComments: GetCommentsUseCase,
    private readonly createComment: CreateCommentUseCase,
    private readonly updateComment: UpdateCommentUseCase,
    private readonly deleteComment: DeleteCommentUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List a bug’s activity (comments)' })
  async list(
    @AuthUser() auth: JwtPayload,
    @Param('bugId') bugId: string,
  ): Promise<CommentResponseDto[]> {
    const result = await this.getComments.execute({ tenantId: auth.tenantId, bugId });
    return CommentMapper.toResponseDtoArray(result.getValue());
  }

  @Post()
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Add a comment (mentions notify the inbox)' })
  async create(
    @AuthUser() auth: JwtPayload,
    @Param('bugId') bugId: string,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentResponseDto> {
    const result = await this.createComment.execute({
      tenantId: auth.tenantId,
      bugId,
      authorId: auth.userId,
      authorName: auth.name,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return CommentMapper.toResponseDto(result.getValue());
  }

  @Patch(':commentId')
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Edit a comment (author or admin)' })
  async update(
    @AuthUser() auth: JwtPayload,
    @Param('bugId') bugId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
  ): Promise<CommentResponseDto> {
    const result = await this.updateComment.execute({
      tenantId: auth.tenantId,
      bugId,
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
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Delete a comment (author or admin)' })
  async remove(
    @AuthUser() auth: JwtPayload,
    @Param('bugId') bugId: string,
    @Param('commentId') commentId: string,
  ): Promise<{ ok: true }> {
    const result = await this.deleteComment.execute({
      tenantId: auth.tenantId,
      bugId,
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
