import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IUsecaseExecute, JwtPayload, Role } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { PasswordService } from '@module-shared/services/password.service';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { UserEntity } from '@application/users/domain/entities/user.entity';
import { ITenantRepository } from '@application/tenants/repositories/tenant.repository';
import { TenantEntity } from '@application/tenants/domain/entities/tenant.entity';
import { RegisterDto } from '../dtos/register.dto';

export interface AuthResult {
  token: string;
  user: UserEntity;
}

/**
 * Registration bootstraps a whole workspace: it creates a new Tenant and its
 * first user as an `admin`, then returns a signed token so the client is logged
 * in immediately.
 */
@Injectable()
export class RegisterUseCase
  implements IUsecaseExecute<{ dto: RegisterDto }, Result<AuthResult>>
{
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(ITenantRepository) private readonly tenants: ITenantRepository,
    private readonly password: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  async execute({ dto }: { dto: RegisterDto }): Promise<Result<AuthResult>> {
    const email = dto.email.trim().toLowerCase();
    if (await this.users.existsByEmail(email)) {
      return Result.fail('An account with this email already exists');
    }

    const tenantResult = TenantEntity.create({ name: dto.tenantName });
    if (tenantResult.isFailure) return Result.fail(tenantResult.error as string);
    const tenant = tenantResult.getValue();
    await this.tenants.save(tenant);

    const passwordHash = await this.password.hash(dto.password);
    const userResult = UserEntity.create({
      tenantId: tenant.id.toString(),
      email,
      name: dto.name,
      passwordHash,
      role: Role.ADMIN,
    });
    if (userResult.isFailure) return Result.fail(userResult.error as string);
    const user = userResult.getValue();
    await this.users.save(user);

    const payload: JwtPayload = {
      userId: user.id.toString(),
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    const token = await this.jwt.signAsync(payload);
    return Result.ok({ token, user });
  }
}
