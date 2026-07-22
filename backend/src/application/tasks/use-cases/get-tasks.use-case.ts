import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { QueryTaskDto } from '../dtos/query-task.dto';
import { TaskPaginationResponse, ITaskRepository } from '../repositories/task.repository';

export interface GetTasksRequest {
  tenantId: string;
  /** The caller — used to scope a `personal` query to their own private board. */
  userId: string;
  query: QueryTaskDto;
}

@Injectable()
export class GetTasksUseCase
  implements IUsecaseExecute<GetTasksRequest, Result<TaskPaginationResponse>>
{
  constructor(@Inject(ITaskRepository) private readonly tasks: ITaskRepository) {}

  async execute({ tenantId, userId, query }: GetTasksRequest): Promise<Result<TaskPaginationResponse>> {
    // A `personal` query returns *only the caller's own* private board — the owner
    // is taken from the token, never the client, so one user can't read another's.
    const result = await this.tasks.findByTenant(tenantId, query, {
      personalOwnerId: query.personal ? userId : undefined,
    });
    return Result.ok(result);
  }
}
