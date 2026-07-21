import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute, Role } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IRoadmapRepository } from '@application/roadmaps/repositories/roadmap.repository';
import { INotifier } from '@application/webhooks/notifier.port';
import { WebhookEvent } from '@application/app-settings/domain/webhook.types';
import { CreateCommentDto } from '../dtos/create-comment.dto';
import { UpdateCommentDto } from '../dtos/update-comment.dto';
import { CommentEntity } from '../domain/entities/comment.entity';
import { ICommentRepository } from '../repositories/comment.repository';
import { COMMENT_FORBIDDEN } from './update-comment.use-case';
import { COMMENT_DELETE_FORBIDDEN } from './delete-comment.use-case';

/**
 * Roadmap-item comment thread — the roadmap-side twin of the bug/task comment
 * use-cases. Shares the `Comment` collection (a comment carries a `bugId` OR a
 * `taskId` OR a `roadmapItemId`). A roadmap item lives inside its roadmap's
 * `items[]`, so create loads the roadmap to validate the item and title the
 * @mention ping; the other operations key straight off the item id.
 */

export interface CreateRoadmapItemCommentRequest {
  tenantId: string;
  roadmapId: string;
  itemId: string;
  authorId: string;
  authorName: string;
  dto: CreateCommentDto;
}

@Injectable()
export class CreateRoadmapItemCommentUseCase
  implements IUsecaseExecute<CreateRoadmapItemCommentRequest, Result<CommentEntity>>
{
  constructor(
    @Inject(ICommentRepository) private readonly comments: ICommentRepository,
    @Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository,
    @Inject(INotifier) private readonly notifier: INotifier,
  ) {}

  async execute({
    tenantId,
    roadmapId,
    itemId,
    authorId,
    authorName,
    dto,
  }: CreateRoadmapItemCommentRequest): Promise<Result<CommentEntity>> {
    const roadmap = await this.roadmaps.findById(roadmapId);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');
    const item = roadmap.items.find((i) => i.id === itemId);
    if (!item) return Result.fail('Roadmap item not found');

    const created = CommentEntity.create({
      tenantId,
      roadmapItemId: itemId,
      authorId,
      authorName,
      body: dto.body,
      mentions: dto.mentions,
      images: dto.images,
    });
    if (created.isFailure) return Result.fail(created.error as string);

    const comment = created.getValue();
    await this.comments.append(comment);

    // Best-effort @mention ping to the workspace's chat channels — same as bug
    // and task comments, so a mention on a roadmap item reaches Lark/Telegram too.
    if (comment.mentions.length) {
      const snippet =
        comment.body.length > 280 ? `${comment.body.slice(0, 280)}…` : comment.body;
      await this.notifier.notify(
        tenantId,
        WebhookEvent.COMMENT_MENTION,
        [`💬 ${authorName} mentioned you on: ${item.title}`, snippet ? `“${snippet}”` : '']
          .filter(Boolean)
          .join('\n'),
        { mentionUserIds: comment.mentions, link: `/roadmaps/${roadmapId}/items/${itemId}` },
      );
    }

    return Result.ok(comment);
  }
}

export interface GetRoadmapItemCommentsRequest {
  tenantId: string;
  itemId: string;
}

@Injectable()
export class GetRoadmapItemCommentsUseCase
  implements IUsecaseExecute<GetRoadmapItemCommentsRequest, Result<CommentEntity[]>>
{
  constructor(@Inject(ICommentRepository) private readonly comments: ICommentRepository) {}

  async execute({
    tenantId,
    itemId,
  }: GetRoadmapItemCommentsRequest): Promise<Result<CommentEntity[]>> {
    return Result.ok(await this.comments.findByRoadmapItem(tenantId, itemId));
  }
}

export interface UpdateRoadmapItemCommentRequest {
  tenantId: string;
  itemId: string;
  commentId: string;
  userId: string;
  role: Role;
  dto: UpdateCommentDto;
}

@Injectable()
export class UpdateRoadmapItemCommentUseCase
  implements IUsecaseExecute<UpdateRoadmapItemCommentRequest, Result<CommentEntity>>
{
  constructor(@Inject(ICommentRepository) private readonly comments: ICommentRepository) {}

  async execute({
    tenantId,
    itemId,
    commentId,
    userId,
    role,
    dto,
  }: UpdateRoadmapItemCommentRequest): Promise<Result<CommentEntity>> {
    const comment = await this.comments.findById(tenantId, commentId);
    if (!comment || comment.roadmapItemId !== itemId) return Result.fail('Comment not found');
    if (comment.authorId !== userId && role !== Role.ADMIN && role !== Role.PRODUCT) {
      return Result.fail(COMMENT_FORBIDDEN);
    }
    const edited = comment.edit({ body: dto.body, mentions: dto.mentions, images: dto.images });
    if (edited.isFailure) return Result.fail(edited.error as string);
    await this.comments.update(comment);
    return Result.ok(comment);
  }
}

export interface DeleteRoadmapItemCommentRequest {
  tenantId: string;
  itemId: string;
  commentId: string;
  userId: string;
  role: Role;
}

@Injectable()
export class DeleteRoadmapItemCommentUseCase
  implements IUsecaseExecute<DeleteRoadmapItemCommentRequest, Result<void>>
{
  constructor(@Inject(ICommentRepository) private readonly comments: ICommentRepository) {}

  async execute({
    tenantId,
    itemId,
    commentId,
    userId,
    role,
  }: DeleteRoadmapItemCommentRequest): Promise<Result<void>> {
    const comment = await this.comments.findById(tenantId, commentId);
    if (!comment || comment.roadmapItemId !== itemId) return Result.fail('Comment not found');
    if (comment.authorId !== userId && role !== Role.ADMIN && role !== Role.PRODUCT) {
      return Result.fail(COMMENT_DELETE_FORBIDDEN);
    }
    await this.comments.delete(commentId);
    return Result.ok();
  }
}
