import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { PasswordService } from '@module-shared/services/password.service';
import { ResetPasswordDto } from '../dtos/reset-password.dto';
import { IUserRepository } from '../repositories/user.repository';

export interface ResetUserPasswordRequest {
  /** The user whose password is being reset. */
  id: string;
  /** The acting admin's tenant — a reset can never cross workspaces. */
  tenantId: string;
  dto: ResetPasswordDto;
}

/**
 * Admin resets another user's password. Same shape as {@link ChangePasswordUseCase}
 * minus the `currentPassword` comparison — the admin isn't proving they know the
 * old password, the route's `@Roles(ADMIN)` is the gate. Tenant-scoped exactly
 * like {@link UpdateUserUseCase}, so an admin can only reset members of their own
 * workspace.
 */
@Injectable()
export class ResetUserPasswordUseCase
  implements IUsecaseExecute<ResetUserPasswordRequest, Result<void>>
{
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    private readonly password: PasswordService,
  ) {}

  async execute({
    id,
    tenantId,
    dto,
  }: ResetUserPasswordRequest): Promise<Result<void>> {
    const user = await this.users.findById(id);
    if (!user || user.tenantId !== tenantId) {
      return Result.fail('User not found');
    }

    const newHash = await this.password.hash(dto.newPassword);
    user.changePassword(newHash);
    await this.users.update(user);
    return Result.ok();
  }
}
