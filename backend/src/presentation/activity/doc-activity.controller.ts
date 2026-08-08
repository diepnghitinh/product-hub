import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { EntityNotFoundException, ForbiddenDomainException } from '@core/exceptions';
import {
  GetDocCommentsUseCase,
  GetDocCommentCountsUseCase,
  CreateDocCommentUseCase,
  UpdateDocCommentUseCase,
  ResolveDocCommentUseCase,
  DeleteDocCommentUseCase,
  COMMENT_RESOLVE_FORBIDDEN,
  COMMENT_FORBIDDEN,
  COMMENT_DELETE_FORBIDDEN,
} from '@application/activity/use-cases';
import {
  CreateDocCommentDto,
  DocPageCommentCountDto,
  ResolveDocCommentDto,
} from '@application/activity/dtos/doc-comment.dtos';
import { UpdateCommentDto } from '@application/activity/dtos/update-comment.dto';
import { CommentResponseDto } from '@application/activity/dtos/comment.response.dto';
import { CommentMapper } from '@application/activity/mappers';
import { DocReadableGuard } from '@application/docs/services/doc-readable.guard';

/**
 * Comments on a doc page — the threads that hang off a highlighted passage.
 *
 * Writing is open to **every signed-in role, Developers included**, which is the
 * one place this controller deliberately parts company with the docs controller
 * next to it: editing a doc's body is Admin / Tester / Product, but asking a
 * question about it can't be, or the people a spec is written *for* have no way
 * to answer back.
 *
 * What it does *not* part company on is who may see the doc at all. A comment
 * quotes the passage it's anchored to, so this list is a way to read a private
 * page sideways — `DocReadableGuard` closes it for every route below at once.
 */
@ApiTags('Activity')
@ApiBearerAuth('JWT-auth')
@Controller('docs/:docId')
@UseGuards(DocReadableGuard)
export class DocActivityController {
  constructor(
    private readonly getComments: GetDocCommentsUseCase,
    private readonly getCounts: GetDocCommentCountsUseCase,
    private readonly createComment: CreateDocCommentUseCase,
    private readonly updateComment: UpdateDocCommentUseCase,
    private readonly resolveComment: ResolveDocCommentUseCase,
    private readonly deleteComment: DeleteDocCommentUseCase,
  ) {}

  /** Open threads per page — the badges in the doc's page rail, in one request. */
  @Get('comment-counts')
  @ApiOperation({ summary: 'Unresolved thread counts for every page of a doc' })
  async counts(
    @AuthUser() auth: JwtPayload,
    @Param('docId') docId: string,
  ): Promise<DocPageCommentCountDto[]> {
    const result = await this.getCounts.execute({ tenantId: auth.tenantId, docId });
    return result.getValue();
  }

  @Get('pages/:pageId/comments')
  @ApiOperation({ summary: 'Comments on a doc page (resolved ones included)' })
  async list(
    @AuthUser() auth: JwtPayload,
    @Param('pageId') pageId: string,
  ): Promise<CommentResponseDto[]> {
    const result = await this.getComments.execute({ tenantId: auth.tenantId, pageId });
    return CommentMapper.toResponseDtoArray(result.getValue());
  }

  @Post('pages/:pageId/comments')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Comment on a passage (or on the page, with no anchor)' })
  async create(
    @AuthUser() auth: JwtPayload,
    @Param('docId') docId: string,
    @Param('pageId') pageId: string,
    @Body() dto: CreateDocCommentDto,
  ): Promise<CommentResponseDto> {
    const result = await this.createComment.execute({
      tenantId: auth.tenantId,
      docId,
      pageId,
      authorId: auth.userId,
      authorName: auth.name,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return CommentMapper.toResponseDto(result.getValue());
  }

  @Patch('pages/:pageId/comments/:commentId')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Edit a comment (author or admin)' })
  async update(
    @AuthUser() auth: JwtPayload,
    @Param('pageId') pageId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
  ): Promise<CommentResponseDto> {
    const result = await this.updateComment.execute({
      tenantId: auth.tenantId,
      pageId,
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

  /** Resolve / reopen. Addressed to any comment in the thread; lands on its root. */
  @Post('pages/:pageId/comments/:commentId/resolve')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Resolve or reopen a thread (author or admin)' })
  async resolve(
    @AuthUser() auth: JwtPayload,
    @Param('pageId') pageId: string,
    @Param('commentId') commentId: string,
    @Body() dto: ResolveDocCommentDto,
  ): Promise<CommentResponseDto> {
    const result = await this.resolveComment.execute({
      tenantId: auth.tenantId,
      pageId,
      commentId,
      userId: auth.userId,
      userName: auth.name,
      role: auth.role,
      resolved: dto.resolved,
    });
    if (result.isFailure) {
      const msg = result.error as string;
      if (msg === COMMENT_RESOLVE_FORBIDDEN) throw new ForbiddenDomainException(msg);
      throw new EntityNotFoundException(msg);
    }
    return CommentMapper.toResponseDto(result.getValue());
  }

  @Delete('pages/:pageId/comments/:commentId')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Delete a comment — a thread root takes its replies with it' })
  async remove(
    @AuthUser() auth: JwtPayload,
    @Param('pageId') pageId: string,
    @Param('commentId') commentId: string,
  ): Promise<{ ok: true }> {
    const result = await this.deleteComment.execute({
      tenantId: auth.tenantId,
      pageId,
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
