/**
 * Authorization roles. An auth/framework concept (the {@link RolesGuard} and JWT
 * payload own it), reused by the users domain so there is a single source of truth.
 */
export enum Role {
  ADMIN = 'admin',
  TESTER = 'tester',
  GUEST = 'guest',
  /** Product manager: full access to Delivery (Testing, Bugs, Tasks) plus
   *  create/edit of Roadmaps & OKRs (but not deleting them). */
  PRODUCT = 'product',
  /** Developer: maintain Delivery work items (test cases, bugs, tasks) only —
   *  no project management, Roadmaps/OKRs, or workspace admin. */
  DEVELOPER = 'developer',
}

export const ROLES: Role[] = [
  Role.ADMIN,
  Role.TESTER,
  Role.GUEST,
  Role.PRODUCT,
  Role.DEVELOPER,
];
