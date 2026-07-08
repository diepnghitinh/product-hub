import { Role } from './role.enum';

/**
 * The decoded JWT, attached to `request.user` by the passport strategy and read
 * via the `@AuthUser()` decorator. `tenantId` scopes every query — never trust a
 * tenantId from the request body.
 */
export interface JwtPayload {
  userId: string;
  tenantId: string;
  email: string;
  name: string;
  role: Role;
}
