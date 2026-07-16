import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { TaskEntity } from '../domain/entities/task.entity';
import { ITaskRepository } from '../repositories/task.repository';

export interface GetTaskRequest {
  id: string;
  tenantId: string;
}

@Injectable()
export class GetTaskUseCase implements IUsecaseExecute<GetTaskRequest, Result<TaskEntity>> {
  constructor(@Inject(ITaskRepository) private readonly tasks: ITaskRepository) {}

  async execute({ id, tenantId }: GetTaskRequest): Promise<Result<TaskEntity>> {
    const task = await this.tasks.findById(id);
    if (!task || task.tenantId !== tenantId) return Result.fail('Task not found');
    return Result.ok(task);
  }
}
