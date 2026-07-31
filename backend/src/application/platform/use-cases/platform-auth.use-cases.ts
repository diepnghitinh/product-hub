import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { PasswordService } from '@module-shared/services/password.service';
import { PlatformAdminEntity } from '../domain/entities/platform-admin.entity';
import { PlatformJwtPayload } from '../domain/platform-jwt-payload';
import { IPlatformAdminRepository } from '../repositories/platform-admin.repository';
import { PlatformLoginDto } from '../dtos/platform-auth.dtos';

export interface PlatformAuthResult {
  token: string;
  admin: PlatformAdminEntity;
}

/**
 * Signs an operator into the platform console.
 *
 * The token it mints is deliberately *not* interchangeable with a workspace
 * token: a different secret, and a `scope: 'platform'` claim the strategy
 * insists on. Neither side can be replayed against the other.
 */
@Injectable()
export class LoginPlatformAdminUseCase
  implements IUsecaseExecute<{ dto: PlatformLoginDto }, Promise<Result<PlatformAuthResult>>>
{
  constructor(
    @Inject(IPlatformAdminRepository)
    private readonly admins: IPlatformAdminRepository,
    private readonly password: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  async execute({ dto }: { dto: PlatformLoginDto }): Promise<Result<PlatformAuthResult>> {
    const admin = await this.admins.findByEmail(dto.email.trim().toLowerCase());
    // One message for every failure mode — this endpoint is internet-facing and
    // must not confirm which operator emails exist.
    if (!admin) return Result.fail('Invalid email or password');

    const ok = await this.password.compare(dto.password, admin.passwordHash);
    if (!ok) return Result.fail('Invalid email or password');
    if (!admin.isActive) return Result.fail('Invalid email or password');

    admin.recordLogin();
    await this.admins.save(admin);

    const payload: PlatformJwtPayload = {
      adminId: admin.id.toString(),
      email: admin.email,
      name: admin.name,
      scope: 'platform',
    };
    const token = await this.jwt.signAsync(payload);
    return Result.ok({ token, admin });
  }
}

/** Resolves the token's operator — the console's session check on every load. */
@Injectable()
export class GetPlatformAdminUseCase
  implements IUsecaseExecute<{ adminId: string }, Promise<Result<PlatformAdminEntity>>>
{
  constructor(
    @Inject(IPlatformAdminRepository)
    private readonly admins: IPlatformAdminRepository,
  ) {}

  async execute({ adminId }: { adminId: string }): Promise<Result<PlatformAdminEntity>> {
    const admin = await this.admins.findById(adminId);
    if (!admin) return Result.fail('Platform account not found');
    // Deactivation has to bite mid-session, not just at the next login.
    if (!admin.isActive) return Result.fail('Platform account is disabled');
    return Result.ok(admin);
  }
}

@Injectable()
export class ChangePlatformPasswordUseCase
  implements
    IUsecaseExecute<
      { adminId: string; currentPassword: string; newPassword: string },
      Promise<Result<void>>
    >
{
  constructor(
    @Inject(IPlatformAdminRepository)
    private readonly admins: IPlatformAdminRepository,
    private readonly password: PasswordService,
  ) {}

  async execute({
    adminId,
    currentPassword,
    newPassword,
  }: {
    adminId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<Result<void>> {
    const admin = await this.admins.findById(adminId);
    if (!admin) return Result.fail('Platform account not found');

    const ok = await this.password.compare(currentPassword, admin.passwordHash);
    if (!ok) return Result.fail('Current password is incorrect');

    admin.changePassword(await this.password.hash(newPassword));
    await this.admins.save(admin);
    return Result.ok();
  }
}
