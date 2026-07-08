import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { UserEntity } from '../domain/entities/user.entity';
import { IUserRepository } from '../repositories/user.repository';

export interface GetUserRequest {
  id: string;
  tenantId: string;
}

@Injectable()
export class GetUserUseCase
  implements IUsecaseExecute<GetUserRequest, Result<UserEntity>>
{
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
  ) {}

  async execute({ id, tenantId }: GetUserRequest): Promise<Result<UserEntity>> {
    const user = await this.users.findById(id);
    if (!user || user.tenantId !== tenantId) {
      return Result.fail('User not found');
    }
    return Result.ok(user);
  }
}
