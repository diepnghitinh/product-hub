import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IUsecaseExecute, JwtPayload } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { PasswordService } from '@module-shared/services/password.service';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { LoginDto } from '../dtos/login.dto';
import { AuthResult } from './register.use-case';

@Injectable()
export class LoginUseCase
  implements IUsecaseExecute<{ dto: LoginDto }, Result<AuthResult>>
{
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    private readonly password: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  async execute({ dto }: { dto: LoginDto }): Promise<Result<AuthResult>> {
    const user = await this.users.findByEmail(dto.email);
    // Same message for "no user" and "wrong password" to avoid enumeration.
    if (!user) return Result.fail('Invalid email or password');

    const ok = await this.password.compare(dto.password, user.passwordHash);
    if (!ok) return Result.fail('Invalid email or password');

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
