import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IUserRepository } from '@application/users/repositories/user.repository';

export interface MarkInboxSeenRequest {
  userId: string;
  tenantId: string;
}

@Injectable()
export class MarkInboxSeenUseCase
  implements IUsecaseExecute<MarkInboxSeenRequest, Result<void>>
{
  constructor(@Inject(IUserRepository) private readonly users: IUserRepository) {}

  async execute({ userId, tenantId }: MarkInboxSeenRequest): Promise<Result<void>> {
    const user = await this.users.findById(userId);
    if (!user || user.tenantId !== tenantId) return Result.fail('User not found');
    user.markInboxSeen();
    await this.users.update(user);
    return Result.ok();
  }
}
