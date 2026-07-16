import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ITaskRepository } from '../repositories/task.repository';

export interface DeleteTaskRequest {
  id: string;
  tenantId: string;
}

@Injectable()
export class DeleteTaskUseCase implements IUsecaseExecute<DeleteTaskRequest, Result<void>> {
  constructor(@Inject(ITaskRepository) private readonly tasks: ITaskRepository) {}

  async execute({ id, tenantId }: DeleteTaskRequest): Promise<Result<void>> {
    const task = await this.tasks.findById(id);
    if (!task || task.tenantId !== tenantId) return Result.fail('Task not found');
    await this.tasks.delete(id);
    return Result.ok();
  }
}
