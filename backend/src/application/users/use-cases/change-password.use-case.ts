import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { PasswordService } from '@module-shared/services/password.service';
import { ChangePasswordDto } from '../dtos/change-password.dto';
import { IUserRepository } from '../repositories/user.repository';

export interface ChangePasswordRequest {
  userId: string;
  dto: ChangePasswordDto;
}

@Injectable()
export class ChangePasswordUseCase
  implements IUsecaseExecute<ChangePasswordRequest, Result<void>>
{
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    private readonly password: PasswordService,
  ) {}

  async execute({ userId, dto }: ChangePasswordRequest): Promise<Result<void>> {
    const user = await this.users.findById(userId);
    if (!user) return Result.fail('User not found');

    const ok = await this.password.compare(dto.currentPassword, user.passwordHash);
    if (!ok) return Result.fail('Current password is incorrect');

    const newHash = await this.password.hash(dto.newPassword);
    user.changePassword(newHash);
    await this.users.update(user);
    return Result.ok();
  }
}
