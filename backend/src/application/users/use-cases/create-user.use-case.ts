import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { PasswordService } from '@module-shared/services/password.service';
import { CreateUserDto } from '../dtos/create-user.dto';
import { UserEntity } from '../domain/entities/user.entity';
import { IUserRepository } from '../repositories/user.repository';

export interface CreateUserRequest {
  tenantId: string;
  dto: CreateUserDto;
}

@Injectable()
export class CreateUserUseCase
  implements IUsecaseExecute<CreateUserRequest, Result<UserEntity>>
{
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    private readonly password: PasswordService,
  ) {}

  async execute({ tenantId, dto }: CreateUserRequest): Promise<Result<UserEntity>> {
    const email = dto.email.trim().toLowerCase();
    if (await this.users.existsByEmail(email)) {
      return Result.fail('A user with this email already exists');
    }

    const passwordHash = await this.password.hash(dto.password);
    const created = UserEntity.create({
      tenantId,
      email,
      name: dto.name,
      passwordHash,
      role: dto.role,
    });
    if (created.isFailure) return Result.fail(created.error as string);

    const user = created.getValue();
    await this.users.save(user);
    return Result.ok(user);
  }
}
