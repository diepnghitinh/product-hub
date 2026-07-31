import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PlatformJwtPayload } from '../domain/platform-jwt-payload';

/** Injects the authenticated platform operator (`request.user`) into a handler. */
export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlatformJwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: PlatformJwtPayload }>();
    return request.user;
  },
);
