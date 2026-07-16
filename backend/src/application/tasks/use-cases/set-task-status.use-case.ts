import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { TaskStatus } from '../domain/enums/task.enums';
import { TaskEntity } from '../domain/entities/task.entity';
import { ITaskRepository } from '../repositories/task.repository';

export interface SetTaskStatusRequest {
  id: string;
  tenantId: string;
  status: TaskStatus;
}

/** Move a task to another status (todo/in-progress/done). */
@Injectable()
export class SetTaskStatusUseCase
  implements IUsecaseExecute<SetTaskStatusRequest, Result<TaskEntity>>
{
  constructor(@Inject(ITaskRepository) private readonly tasks: ITaskRepository) {}

  async execute({ id, tenantId, status }: SetTaskStatusRequest): Promise<Result<TaskEntity>> {
    const task = await this.tasks.findById(id);
    if (!task || task.tenantId !== tenantId) return Result.fail('Task not found');
    task.setStatus(status);
    await this.tasks.update(task);
    return Result.ok(task);
  }
}
