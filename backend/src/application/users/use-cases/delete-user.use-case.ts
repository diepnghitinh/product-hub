import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IUserRepository } from '../repositories/user.repository';

export interface DeleteUserRequest {
  id: string;
  tenantId: string;
  /** The acting admin's id — guards against deleting your own account. */
  actingUserId: string;
}

@Injectable()
export class DeleteUserUseCase
  implements IUsecaseExecute<DeleteUserRequest, Result<void>>
{
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
  ) {}

  async execute({
    id,
    tenantId,
    actingUserId,
  }: DeleteUserRequest): Promise<Result<void>> {
    if (id === actingUserId) {
      return Result.fail('You cannot delete your own account');
    }
    const user = await this.users.findById(id);
    if (!user || user.tenantId !== tenantId) {
      return Result.fail('User not found');
    }
    await this.users.delete(id);
    return Result.ok();
  }
}
