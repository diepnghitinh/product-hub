import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute, Role } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ITaskRepository } from '@application/tasks/repositories/task.repository';
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
    @Inject(ITaskRepository) private readonly tasks: ITaskRepository,
  ) {}

  async execute({
    tenantId,
    taskId,
    authorId,
    authorName,
    dto,
  }: CreateTaskCommentRequest): Promise<Result<CommentEntity>> {
    const task = await this.tasks.findById(taskId);
    if (!task || task.tenantId !== tenantId) return Result.fail('Task not found');

    const created = CommentEntity.create({
      tenantId,
      taskId,
      authorId,
      authorName,
      body: dto.body,
      mentions: dto.mentions,
      images: dto.images,
    });
    if (created.isFailure) return Result.fail(created.error as string);

    const comment = created.getValue();
    await this.comments.append(comment);
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
