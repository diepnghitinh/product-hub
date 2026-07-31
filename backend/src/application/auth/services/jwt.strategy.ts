import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '@core/interfaces';
import { ITenantRepository } from '@application/tenants/repositories/tenant.repository';
import { jwtConstants } from '../constants';

/** How long a tenant's status is trusted before it's re-read. */
const STATUS_TTL_MS = 30_000;

/**
 * Validates the bearer token and returns the payload that becomes `request.user`.
 * Registered under the name 'jwt', which the global {@link JwtAuthGuard} uses.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  /** tenantId → { suspended, expires } — see {@link isSuspended}. */
  private readonly statusCache = new Map<string, { suspended: boolean; expires: number }>();

  constructor(@Inject(ITenantRepository) private readonly tenants: ITenantRepository) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (payload.tenantId && (await this.isSuspended(payload.tenantId))) {
      throw new UnauthorizedException('This workspace is suspended');
    }
    return {
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
  }

  /**
   * Tokens live for days, so checking suspension only at login would leave a
   * suspended workspace working for the rest of the week. Checking it here makes
   * suspension bite mid-session; the 30-second memo keeps that from costing a
   * database read on every single request. The trade-off is the one worth
   * stating: suspending a workspace takes effect within 30 seconds, not instantly.
   */
  private async isSuspended(tenantId: string): Promise<boolean> {
    const now = Date.now();
    const cached = this.statusCache.get(tenantId);
    if (cached && cached.expires > now) return cached.suspended;

    const tenant = await this.tenants.findById(tenantId);
    // A token for a tenant that no longer exists isn't "suspended" — leaving it
    // false keeps deletion semantics out of this check.
    const suspended = tenant?.isSuspended ?? false;
    this.statusCache.set(tenantId, { suspended, expires: now + STATUS_TTL_MS });
    return suspended;
  }
}
