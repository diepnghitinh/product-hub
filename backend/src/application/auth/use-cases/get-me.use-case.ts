import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { UserEntity } from '@application/users/domain/entities/user.entity';

@Injectable()
export class GetMeUseCase
  implements IUsecaseExecute<{ userId: string }, Result<UserEntity>>
{
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
  ) {}

  async execute({ userId }: { userId: string }): Promise<Result<UserEntity>> {
    const user = await this.users.findById(userId);
    if (!user) return Result.fail('User not found');
    return Result.ok(user);
  }
}
