import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute, Role } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import { IssueKind } from '@application/issues/domain/enums/issue.enums';
import { INotifier } from '@application/webhooks/notifier.port';
import { WebhookEvent } from '@application/app-settings/domain/webhook.types';
import { CreateCommentDto } from '../dtos/create-comment.dto';
import { UpdateCommentDto } from '../dtos/update-comment.dto';
import { CommentEntity } from '../domain/entities/comment.entity';
import { ICommentRepository } from '../repositories/comment.repository';

/**
 * Issue comment thread — one code path for bugs and tasks now that both live in
 * the unified `issues` collection under a shared id. A comment carries the
 * canonical `issueId`; create also mirrors it to the legacy `bugId`/`taskId`
 * (by the issue's kind) so the inbox keeps resolving bug mentions and the change
 * stays reversible. Roadmap-item comments stay in their own use-cases.
 */

/** Sentinel messages so a controller can map an authorization failure to 403. */
export const COMMENT_FORBIDDEN = 'You can only edit your own comments';
export const COMMENT_DELETE_FORBIDDEN = 'You can only delete your own comments';

export interface CreateIssueCommentRequest {
  tenantId: string;
  issueId: string;
  authorId: string;
  authorName: string;
  dto: CreateCommentDto;
}

@Injectable()
export class CreateIssueCommentUseCase
  implements IUsecaseExecute<CreateIssueCommentRequest, Result<CommentEntity>>
{
  constructor(
    @Inject(ICommentRepository) private readonly comments: ICommentRepository,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(INotifier) private readonly notifier: INotifier,
  ) {}

  async execute({
    tenantId,
    issueId,
    authorId,
    authorName,
    dto,
  }: CreateIssueCommentRequest): Promise<Result<CommentEntity>> {
    const issue = await this.issues.findById(issueId);
    if (!issue || issue.tenantId !== tenantId) return Result.fail('Issue not found');

    const parentId = await this.resolveParentId(tenantId, issueId, dto.parentId);
    const isBug = issue.kind === IssueKind.BUG;

    const created = CommentEntity.create({
      tenantId,
      issueId,
      // Legacy mirror by kind — keeps the bug-only inbox working and the migration reversible.
      bugId: isBug ? issueId : '',
      taskId: isBug ? '' : issueId,
      parentId,
      authorId,
      authorName,
      body: dto.body,
      mentions: dto.mentions,
      images: dto.images,
    });
    if (created.isFailure) return Result.fail(created.error as string);

    const comment = created.getValue();
    await this.comments.append(comment);

    // Best-effort @mention ping to the workspace's chat channels; the link routes
    // by kind so it opens the right board.
    if (comment.mentions.length) {
      const snippet =
        comment.body.length > 280 ? `${comment.body.slice(0, 280)}…` : comment.body;
      await this.notifier.notify(
        tenantId,
        WebhookEvent.COMMENT_MENTION,
        [`💬 ${authorName} mentioned you on: ${issue.title}`, snippet ? `“${snippet}”` : '']
          .filter(Boolean)
          .join('\n'),
        {
          mentionUserIds: comment.mentions,
          link: `${isBug ? '/bugs' : '/tasks'}/${issue.shortId}`,
        },
      );
    }

    return Result.ok(comment);
  }

  /**
   * Resolve a reply's parent to a top-level comment on the same issue. Threads are
   * one level deep, so replying to a reply attaches to that reply's root. An
   * unknown or foreign parent degrades to a top-level comment rather than erroring.
   */
  private async resolveParentId(
    tenantId: string,
    issueId: string,
    parentId?: string,
  ): Promise<string> {
    if (!parentId) return '';
    const parent = await this.comments.findById(tenantId, parentId);
    if (!parent || parent.issueId !== issueId) return '';
    return parent.parentId || parent.id.toString();
  }
}

export interface GetIssueCommentsRequest {
  tenantId: string;
  issueId: string;
}

@Injectable()
export class GetIssueCommentsUseCase
  implements IUsecaseExecute<GetIssueCommentsRequest, Result<CommentEntity[]>>
{
  constructor(@Inject(ICommentRepository) private readonly comments: ICommentRepository) {}

  async execute({ tenantId, issueId }: GetIssueCommentsRequest): Promise<Result<CommentEntity[]>> {
    return Result.ok(await this.comments.findByIssue(tenantId, issueId));
  }
}

export interface UpdateIssueCommentRequest {
  tenantId: string;
  issueId: string;
  commentId: string;
  userId: string;
  role: Role;
  dto: UpdateCommentDto;
}

@Injectable()
export class UpdateIssueCommentUseCase
  implements IUsecaseExecute<UpdateIssueCommentRequest, Result<CommentEntity>>
{
  constructor(@Inject(ICommentRepository) private readonly comments: ICommentRepository) {}

  async execute({
    tenantId,
    issueId,
    commentId,
    userId,
    role,
    dto,
  }: UpdateIssueCommentRequest): Promise<Result<CommentEntity>> {
    const comment = await this.comments.findById(tenantId, commentId);
    if (!comment || comment.issueId !== issueId) return Result.fail('Comment not found');
    if (comment.authorId !== userId && role !== Role.ADMIN && role !== Role.PRODUCT) {
      return Result.fail(COMMENT_FORBIDDEN);
    }
    const edited = comment.edit({ body: dto.body, mentions: dto.mentions, images: dto.images });
    if (edited.isFailure) return Result.fail(edited.error as string);
    await this.comments.update(comment);
    return Result.ok(comment);
  }
}

export interface DeleteIssueCommentRequest {
  tenantId: string;
  issueId: string;
  commentId: string;
  userId: string;
  role: Role;
}

@Injectable()
export class DeleteIssueCommentUseCase
  implements IUsecaseExecute<DeleteIssueCommentRequest, Result<void>>
{
  constructor(@Inject(ICommentRepository) private readonly comments: ICommentRepository) {}

  async execute({
    tenantId,
    issueId,
    commentId,
    userId,
    role,
  }: DeleteIssueCommentRequest): Promise<Result<void>> {
    const comment = await this.comments.findById(tenantId, commentId);
    if (!comment || comment.issueId !== issueId) return Result.fail('Comment not found');
    if (comment.authorId !== userId && role !== Role.ADMIN && role !== Role.PRODUCT) {
      return Result.fail(COMMENT_DELETE_FORBIDDEN);
    }
    await this.comments.delete(commentId);
    return Result.ok();
  }
}
