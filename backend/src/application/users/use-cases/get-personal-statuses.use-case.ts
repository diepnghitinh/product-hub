import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { TaskStatusConfig } from '@application/tasks/domain/enums/task.enums';
import { IUserRepository } from '../repositories/user.repository';

export interface GetPersonalStatusesRequest {
  userId: string;
}

/** Read the columns of the caller's own private personal board. */
@Injectable()
export class GetPersonalStatusesUseCase
  implements IUsecaseExecute<GetPersonalStatusesRequest, Result<TaskStatusConfig[]>>
{
  constructor(@Inject(IUserRepository) private readonly users: IUserRepository) {}

  async execute({ userId }: GetPersonalStatusesRequest): Promise<Result<TaskStatusConfig[]>> {
    const user = await this.users.findById(userId);
    if (!user) return Result.fail('User not found');
    return Result.ok(user.personalStatuses);
  }
}
