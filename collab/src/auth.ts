import jwt from 'jsonwebtoken';
import { ROOM_SEPARATOR } from './constants.js';
import { env } from './env.js';

/** Mirrors backend/libs/core/interfaces/role.enum.ts. */
export const Role = {
  ADMIN: 'admin',
  TESTER: 'tester',
  GUEST: 'guest',
  PRODUCT: 'product',
  DEVELOPER: 'developer',
} as const;

export type RoleValue = (typeof Role)[keyof typeof Role];

/**
 * Who may change a doc page's body. Mirrors the API's
 * `@Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT)` on `PATCH /docs/:id/pages/:pageId`
 * — the two must agree, or a developer who can't save over REST could still
 * type into the CRDT and have the mirror write it for them.
 *
 * Everyone else still connects, read-only: reading a doc has never been gated,
 * and a read-only connection is what makes "I can see you editing" work for a
 * developer watching a spec being written.
 */
const WRITE_ROLES = new Set<string>([Role.ADMIN, Role.TESTER, Role.PRODUCT]);

/** The API's JwtPayload (backend/libs/core/interfaces/jwt-payload.interface.ts). */
export interface TokenPayload {
  userId: string;
  tenantId: string;
  email: string;
  name: string;
  role: RoleValue;
}

/** What every hook downstream knows about the connected editor. */
export interface CollabContext extends TokenPayload {
  canWrite: boolean;
}

export function canWrite(role: string): boolean {
  return WRITE_ROLES.has(role);
}

/**
 * Verifies an API access token. Throws on anything unusable — an expired token,
 * a foreign signature, or a payload missing the fields every hook relies on.
 */
export function verifyToken(token: string | undefined | null): TokenPayload {
  if (!token) throw new Error('missing token');

  const decoded = jwt.verify(token, env.jwtSecret);
  if (typeof decoded === 'string') throw new Error('unexpected token payload');

  const { userId, tenantId, email, name, role } = decoded as Partial<TokenPayload>;
  if (!userId || !tenantId || !role) throw new Error('incomplete token payload');

  return { userId, tenantId, email: email ?? '', name: name ?? '', role };
}

export interface Room {
  tenantId: string;
  pageId: string;
}

/**
 * Splits `<tenantId>:<pageId>`. The tenant here is untrusted input — it only
 * becomes meaningful once {@link assertRoomBelongsToToken} has matched it
 * against the token.
 */
export function parseRoom(documentName: string): Room {
  const index = documentName.indexOf(ROOM_SEPARATOR);
  if (index <= 0 || index === documentName.length - 1) {
    throw new Error(`malformed room name: ${documentName}`);
  }
  return {
    tenantId: documentName.slice(0, index),
    pageId: documentName.slice(index + 1),
  };
}

export function roomName(tenantId: string, pageId: string): string {
  return `${tenantId}${ROOM_SEPARATOR}${pageId}`;
}

export function assertRoomBelongsToToken(room: Room, token: TokenPayload): void {
  if (room.tenantId !== token.tenantId) {
    throw new Error('room belongs to another workspace');
  }
}
