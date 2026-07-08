import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@core/interfaces';
import { ROLES_KEY } from '@core/decorators/roles.decorator';

/**
 * Enforces `@Roles(...)` on a handler/controller. No metadata → open to any
 * authenticated user. Assumes the JWT guard has already populated `request.user`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { role?: Role } }>();
    return !!user && required.includes(user.role);
  }
}
