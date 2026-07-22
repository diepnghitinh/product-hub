import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { TaskEntity } from '../domain/entities/task.entity';
import { ITaskRepository } from '../repositories/task.repository';

export interface GetTaskRequest {
  id: string;
  tenantId: string;
  /** The caller — a personal task is only readable by its owner or an admin. */
  requesterId: string;
  isAdmin: boolean;
}

@Injectable()
export class GetTaskUseCase implements IUsecaseExecute<GetTaskRequest, Result<TaskEntity>> {
  constructor(@Inject(ITaskRepository) private readonly tasks: ITaskRepository) {}

  async execute({ id, tenantId, requesterId, isAdmin }: GetTaskRequest): Promise<Result<TaskEntity>> {
    // `id` is the URL ref: a shortId (TSK-7) or a legacy uuid.
    const task = await this.tasks.findByRef(tenantId, id);
    if (!task) return Result.fail('Task not found');
    // A personal task is private to its owner (+ admins). Report "not found"
    // rather than "forbidden" so a stranger can't even confirm the ref exists.
    if (!task.isVisibleTo(requesterId, isAdmin)) return Result.fail('Task not found');
    return Result.ok(task);
  }
}
