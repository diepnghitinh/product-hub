import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ITaskRepository } from '../repositories/task.repository';

export interface DeleteTaskRequest {
  id: string;
  tenantId: string;
  /** The caller — a personal task is only deletable by its owner or an admin. */
  requesterId: string;
  isAdmin: boolean;
}

@Injectable()
export class DeleteTaskUseCase implements IUsecaseExecute<DeleteTaskRequest, Result<void>> {
  constructor(@Inject(ITaskRepository) private readonly tasks: ITaskRepository) {}

  async execute({ id, tenantId, requesterId, isAdmin }: DeleteTaskRequest): Promise<Result<void>> {
    const task = await this.tasks.findById(id);
    if (!task || task.tenantId !== tenantId) return Result.fail('Task not found');
    // A personal task can only be deleted by its owner (or an admin).
    if (!task.isVisibleTo(requesterId, isAdmin)) return Result.fail('Task not found');
    await this.tasks.delete(id);
    return Result.ok();
  }
}
