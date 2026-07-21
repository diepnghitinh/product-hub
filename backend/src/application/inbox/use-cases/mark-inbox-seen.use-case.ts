import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { GetInboxUseCase } from './get-inbox.use-case';

export interface MarkInboxSeenRequest {
  userId: string;
  tenantId: string;
}

/**
 * "Mark all read" — marks every notification currently in the user's inbox read
 * by recomputing the inbox and storing each item's key. Recomputing (rather than
 * a blanket flag) keeps read state per-item, so a bug updated *after* this runs
 * still re-surfaces as unread.
 */
@Injectable()
export class MarkInboxSeenUseCase
  implements IUsecaseExecute<MarkInboxSeenRequest, Result<void>>
{
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    private readonly getInbox: GetInboxUseCase,
  ) {}

  async execute({ userId, tenantId }: MarkInboxSeenRequest): Promise<Result<void>> {
    const user = await this.users.findById(userId);
    if (!user || user.tenantId !== tenantId) return Result.fail('User not found');

    const inbox = await this.getInbox.execute({ userId, tenantId });
    if (inbox.isFailure) return Result.fail(inbox.error as string);

    user.markInboxItemsRead(inbox.getValue().items.map((i) => i.key));
    await this.users.update(user);
    return Result.ok();
  }
}
