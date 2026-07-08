import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '@core/interfaces';

/**
 * Injects the authenticated JWT payload (`request.user`) into a controller
 * handler. Use it to read `tenantId` / `role` for tenant-scoped use-cases.
 */
export const AuthUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user;
  },
);
