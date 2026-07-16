import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { QueryTaskDto } from '../dtos/query-task.dto';
import { TaskPaginationResponse, ITaskRepository } from '../repositories/task.repository';

export interface GetTasksRequest {
  tenantId: string;
  query: QueryTaskDto;
}

@Injectable()
export class GetTasksUseCase
  implements IUsecaseExecute<GetTasksRequest, Result<TaskPaginationResponse>>
{
  constructor(@Inject(ITaskRepository) private readonly tasks: ITaskRepository) {}

  async execute({ tenantId, query }: GetTasksRequest): Promise<Result<TaskPaginationResponse>> {
    const result = await this.tasks.findByTenant(tenantId, query);
    return Result.ok(result);
  }
}
