import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IUserRepository } from '@application/users/repositories/user.repository';

export interface MarkInboxItemReadRequest {
  userId: string;
  tenantId: string;
  key: string;
}

/** Marks a single notification read — opening/clicking it, not the whole inbox. */
@Injectable()
export class MarkInboxItemReadUseCase
  implements IUsecaseExecute<MarkInboxItemReadRequest, Result<void>>
{
  constructor(@Inject(IUserRepository) private readonly users: IUserRepository) {}

  async execute({ userId, tenantId, key }: MarkInboxItemReadRequest): Promise<Result<void>> {
    const user = await this.users.findById(userId);
    if (!user || user.tenantId !== tenantId) return Result.fail('User not found');
    user.markInboxItemsRead([key]);
    await this.users.update(user);
    return Result.ok();
  }
}
