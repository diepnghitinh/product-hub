/**
 * Authorization roles. An auth/framework concept (the {@link RolesGuard} and JWT
 * payload own it), reused by the users domain so there is a single source of truth.
 */
export enum Role {
  ADMIN = 'admin',
  TESTER = 'tester',
  GUEST = 'guest',
}

export const ROLES: Role[] = [Role.ADMIN, Role.TESTER, Role.GUEST];
