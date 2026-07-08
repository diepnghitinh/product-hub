import { SetMetadata } from '@nestjs/common';
import { Role } from '@core/interfaces';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given roles (enforced by {@link RolesGuard}). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
