import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { UserEntity } from '../domain/entities/user.entity';
import { IUserRepository } from '../repositories/user.repository';

export interface UpdateMyAvatarRequest {
  userId: string;
  /** Cloud-storage URL, or null to clear back to initials. */
  avatarUrl: string | null;
}

/**
 * The signed-in user sets or removes their own avatar. Self-service: the caller
 * is always the token's user, so there's no tenant/ownership check to make — you
 * can only ever change your own. The image is compressed and uploaded to cloud
 * storage on the client *before* this runs; here we just persist the URL.
 */
@Injectable()
export class UpdateMyAvatarUseCase
  implements IUsecaseExecute<UpdateMyAvatarRequest, Result<UserEntity>>
{
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
  ) {}

  async execute({ userId, avatarUrl }: UpdateMyAvatarRequest): Promise<Result<UserEntity>> {
    const user = await this.users.findById(userId);
    if (!user) return Result.fail('User not found');

    user.setAvatar(avatarUrl);
    await this.users.update(user);
    return Result.ok(user);
  }
}
