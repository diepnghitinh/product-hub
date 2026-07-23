import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import { INotifier } from '@application/webhooks/notifier.port';
import { WebhookEvent } from '@application/app-settings/domain/webhook.types';
import { CreateCommentDto } from '../dtos/create-comment.dto';
import { CommentEntity } from '../domain/entities/comment.entity';
import { ICommentRepository } from '../repositories/comment.repository';

export interface CreateCommentRequest {
  tenantId: string;
  bugId: string;
  authorId: string;
  authorName: string;
  dto: CreateCommentDto;
}

@Injectable()
export class CreateCommentUseCase
  implements IUsecaseExecute<CreateCommentRequest, Result<CommentEntity>>
{
  constructor(
    @Inject(ICommentRepository) private readonly comments: ICommentRepository,
    // The subject is validated against the unified `issues` collection (the bug's
    // authoritative home); `bugId` is the issue's shared _id, kind = bug.
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(INotifier) private readonly notifier: INotifier,
  ) {}

  async execute({
    tenantId,
    bugId,
    authorId,
    authorName,
    dto,
  }: CreateCommentRequest): Promise<Result<CommentEntity>> {
    const bug = await this.issues.findById(bugId);
    if (!bug || bug.tenantId !== tenantId) return Result.fail('Bug not found');

    const parentId = await this.resolveParentId(tenantId, bugId, dto.parentId);

    const created = CommentEntity.create({
      tenantId,
      bugId,
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

    // Best-effort @mention ping to the workspace's chat channels.
    if (comment.mentions.length) {
      const snippet =
        comment.body.length > 280 ? `${comment.body.slice(0, 280)}…` : comment.body;
      await this.notifier.notify(
        tenantId,
        WebhookEvent.COMMENT_MENTION,
        [`💬 ${authorName} mentioned you on: ${bug.title}`, snippet ? `“${snippet}”` : '']
          .filter(Boolean)
          .join('\n'),
        { mentionUserIds: comment.mentions, link: `/bugs/${bug.shortId}` },
      );
    }

    return Result.ok(comment);
  }

  /**
   * Resolve a reply's parent to a top-level comment on the same bug. Threads are
   * one level deep, so replying to a reply attaches to that reply's root. An
   * unknown or foreign parent (e.g. it was deleted, or belongs to another
   * subject) degrades to a top-level comment rather than erroring.
   */
  private async resolveParentId(
    tenantId: string,
    bugId: string,
    parentId?: string,
  ): Promise<string> {
    if (!parentId) return '';
    const parent = await this.comments.findById(tenantId, parentId);
    if (!parent || parent.bugId !== bugId) return '';
    return parent.parentId || parent.id.toString();
  }
}
