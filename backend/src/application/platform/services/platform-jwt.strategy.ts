import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { platformJwtConstants } from '../constants';
import { PlatformJwtPayload } from '../domain/platform-jwt-payload';

export const PLATFORM_JWT_STRATEGY = 'platform-jwt';

/**
 * Validates a *platform operator's* bearer token. Registered under its own
 * strategy name so it can never be confused with the tenant `jwt` strategy —
 * and signed with its own secret, so a stolen tenant token cannot be replayed
 * against the platform API even if the payload shape were forged.
 */
@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(
  Strategy,
  PLATFORM_JWT_STRATEGY,
) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: platformJwtConstants.secret,
    });
  }

  validate(payload: PlatformJwtPayload): PlatformJwtPayload {
    // Belt and braces: only tokens this service minted for the platform carry
    // `scope: 'platform'`, so a token signed with the same secret for anything
    // else is still refused.
    if (payload?.scope !== 'platform') {
      throw new UnauthorizedException('Not a platform token');
    }
    return {
      adminId: payload.adminId,
      email: payload.email,
      name: payload.name,
      scope: 'platform',
    };
  }
}
