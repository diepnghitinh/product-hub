import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { TaskStatusConfig } from '@application/tasks/domain/enums/task.enums';
import { ReplacePersonalStatusesDto } from '../dtos/personal-statuses.dto';
import { IUserRepository } from '../repositories/user.repository';

export interface ReplacePersonalStatusesRequest {
  userId: string;
  dto: ReplacePersonalStatusesDto;
}

/**
 * Replace the caller's personal-board columns. Keys must be unique so a task's
 * stored status maps to exactly one column; the frontend reassigns tasks off a
 * removed column before calling this.
 */
@Injectable()
export class ReplacePersonalStatusesUseCase
  implements IUsecaseExecute<ReplacePersonalStatusesRequest, Result<TaskStatusConfig[]>>
{
  constructor(@Inject(IUserRepository) private readonly users: IUserRepository) {}

  async execute({
    userId,
    dto,
  }: ReplacePersonalStatusesRequest): Promise<Result<TaskStatusConfig[]>> {
    const user = await this.users.findById(userId);
    if (!user) return Result.fail('User not found');

    const keys = dto.personalStatuses.map((s) => s.key);
    if (new Set(keys).size !== keys.length) {
      return Result.fail('Column keys must be unique');
    }

    user.replacePersonalStatuses(dto.personalStatuses);
    await this.users.update(user);
    return Result.ok(user.personalStatuses);
  }
}
