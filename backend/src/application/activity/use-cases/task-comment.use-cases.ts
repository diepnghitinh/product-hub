import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute, Role } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import { INotifier } from '@application/webhooks/notifier.port';
import { WebhookEvent } from '@application/app-settings/domain/webhook.types';
import { CreateCommentDto } from '../dtos/create-comment.dto';
import { UpdateCommentDto } from '../dtos/update-comment.dto';
import { CommentEntity } from '../domain/entities/comment.entity';
import { ICommentRepository } from '../repositories/comment.repository';
import { COMMENT_FORBIDDEN } from './update-comment.use-case';
import { COMMENT_DELETE_FORBIDDEN } from './delete-comment.use-case';

/**
 * Task comment thread — the task-side twin of the bug comment use-cases. Shares
 * the `Comment` collection (a comment carries a `bugId` OR a `taskId`); a task
 * comment's mentions are stored but not surfaced in the inbox in v1.
 */

export interface CreateTaskCommentRequest {
  tenantId: string;
  taskId: string;
  authorId: string;
  authorName: string;
  dto: CreateCommentDto;
}

@Injectable()
export class CreateTaskCommentUseCase
  implements IUsecaseExecute<CreateTaskCommentRequest, Result<CommentEntity>>
{
  constructor(
    @Inject(ICommentRepository) private readonly comments: ICommentRepository,
    // Validate the subject against the unified `issues` collection (the task's
    // authoritative home); `taskId` is the issue's shared _id, kind = task.
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(INotifier) private readonly notifier: INotifier,
  ) {}

  async execute({
    tenantId,
    taskId,
    authorId,
    authorName,
    dto,
  }: CreateTaskCommentRequest): Promise<Result<CommentEntity>> {
    const task = await this.issues.findById(taskId);
    if (!task || task.tenantId !== tenantId) return Result.fail('Task not found');

    // Resolve a reply to a top-level comment on this task; threads stay one level
    // deep and an unknown/foreign parent degrades to a top-level comment.
    let parentId = '';
    if (dto.parentId) {
      const parent = await this.comments.findById(tenantId, dto.parentId);
      if (parent && parent.taskId === taskId) parentId = parent.parentId || parent.id.toString();
    }

    const created = CommentEntity.create({
      tenantId,
      taskId,
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

    // Best-effort @mention ping to the workspace's chat channels — the task-side
    // twin of the bug comment notify (Lark/Telegram). Task comments were missing
    // this, so mentioning someone in a task never reached the channel.
    if (comment.mentions.length) {
      const snippet =
        comment.body.length > 280 ? `${comment.body.slice(0, 280)}…` : comment.body;
      await this.notifier.notify(
        tenantId,
        WebhookEvent.COMMENT_MENTION,
        [`💬 ${authorName} mentioned you on: ${task.title}`, snippet ? `“${snippet}”` : '']
          .filter(Boolean)
          .join('\n'),
        { mentionUserIds: comment.mentions, link: `/tasks/${task.shortId}` },
      );
    }

    return Result.ok(comment);
  }
}

export interface GetTaskCommentsRequest {
  tenantId: string;
  taskId: string;
}

@Injectable()
export class GetTaskCommentsUseCase
  implements IUsecaseExecute<GetTaskCommentsRequest, Result<CommentEntity[]>>
{
  constructor(@Inject(ICommentRepository) private readonly comments: ICommentRepository) {}

  async execute({ tenantId, taskId }: GetTaskCommentsRequest): Promise<Result<CommentEntity[]>> {
    return Result.ok(await this.comments.findByTask(tenantId, taskId));
  }
}

export interface UpdateTaskCommentRequest {
  tenantId: string;
  taskId: string;
  commentId: string;
  userId: string;
  role: Role;
  dto: UpdateCommentDto;
}

@Injectable()
export class UpdateTaskCommentUseCase
  implements IUsecaseExecute<UpdateTaskCommentRequest, Result<CommentEntity>>
{
  constructor(@Inject(ICommentRepository) private readonly comments: ICommentRepository) {}

  async execute({
    tenantId,
    taskId,
    commentId,
    userId,
    role,
    dto,
  }: UpdateTaskCommentRequest): Promise<Result<CommentEntity>> {
    const comment = await this.comments.findById(tenantId, commentId);
    if (!comment || comment.taskId !== taskId) return Result.fail('Comment not found');
    if (comment.authorId !== userId && role !== Role.ADMIN && role !== Role.PRODUCT) {
      return Result.fail(COMMENT_FORBIDDEN);
    }
    const edited = comment.edit({ body: dto.body, mentions: dto.mentions, images: dto.images });
    if (edited.isFailure) return Result.fail(edited.error as string);
    await this.comments.update(comment);
    return Result.ok(comment);
  }
}

export interface DeleteTaskCommentRequest {
  tenantId: string;
  taskId: string;
  commentId: string;
  userId: string;
  role: Role;
}

@Injectable()
export class DeleteTaskCommentUseCase
  implements IUsecaseExecute<DeleteTaskCommentRequest, Result<void>>
{
  constructor(@Inject(ICommentRepository) private readonly comments: ICommentRepository) {}

  async execute({
    tenantId,
    taskId,
    commentId,
    userId,
    role,
  }: DeleteTaskCommentRequest): Promise<Result<void>> {
    const comment = await this.comments.findById(tenantId, commentId);
    if (!comment || comment.taskId !== taskId) return Result.fail('Comment not found');
    if (comment.authorId !== userId && role !== Role.ADMIN && role !== Role.PRODUCT) {
      return Result.fail(COMMENT_DELETE_FORBIDDEN);
    }
    await this.comments.delete(commentId);
    return Result.ok();
  }
}
