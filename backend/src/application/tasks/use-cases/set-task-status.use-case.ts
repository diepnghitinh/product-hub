import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { TaskEntity } from '../domain/entities/task.entity';
import { ITaskRepository } from '../repositories/task.repository';

export interface SetTaskStatusRequest {
  id: string;
  tenantId: string;
  /** The caller — a personal task is only movable by its owner or an admin. */
  requesterId: string;
  isAdmin: boolean;
  status: string;
}

/** Move a task to another status (todo/in-progress/done). */
@Injectable()
export class SetTaskStatusUseCase
  implements IUsecaseExecute<SetTaskStatusRequest, Result<TaskEntity>>
{
  constructor(@Inject(ITaskRepository) private readonly tasks: ITaskRepository) {}

  async execute({ id, tenantId, requesterId, isAdmin, status }: SetTaskStatusRequest): Promise<Result<TaskEntity>> {
    const task = await this.tasks.findById(id);
    if (!task || task.tenantId !== tenantId) return Result.fail('Task not found');
    // A personal task can only be moved by its owner (or an admin).
    if (!task.isVisibleTo(requesterId, isAdmin)) return Result.fail('Task not found');
    task.setStatus(status);
    await this.tasks.update(task);
    return Result.ok(task);
  }
}
