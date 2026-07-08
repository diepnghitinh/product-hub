import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { UpdateUserDto } from '../dtos/update-user.dto';
import { UserEntity } from '../domain/entities/user.entity';
import { IUserRepository } from '../repositories/user.repository';

export interface UpdateUserRequest {
  id: string;
  tenantId: string;
  dto: UpdateUserDto;
}

@Injectable()
export class UpdateUserUseCase
  implements IUsecaseExecute<UpdateUserRequest, Result<UserEntity>>
{
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
  ) {}

  async execute({
    id,
    tenantId,
    dto,
  }: UpdateUserRequest): Promise<Result<UserEntity>> {
    const user = await this.users.findById(id);
    if (!user || user.tenantId !== tenantId) {
      return Result.fail('User not found');
    }

    if (dto.name !== undefined) user.updateName(dto.name);
    if (dto.role !== undefined) user.updateRole(dto.role);

    await this.users.update(user);
    return Result.ok(user);
  }
}
