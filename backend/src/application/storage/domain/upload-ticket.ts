import { ForbiddenException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { jwtConstants } from '@application/auth/constants';

/**
 * How big one chunk is. **8 MiB**, and the floor is not ours to choose: S3
 * rejects a multipart part under 5 MiB (last part excepted), so anything
 * smaller would work on Azure and MinIO and fail on real S3. The ceiling is
 * 10,000 parts, which at this size is 80 GiB — far past any tenant's cap.
 */
export const CHUNK_SIZE = 8 * 1024 * 1024;

/** How long a begun upload may take before its ticket stops being accepted. */
const TICKET_TTL_MS = 6 * 60 * 60 * 1000; // 6h

/** Domain separation: this HMAC must never verify as anything else. */
const CONTEXT = 'product-os:upload-ticket:v1';

/**
 * Everything the server needs to accept the next chunk of an upload it already
 * agreed to. Signed and handed to the client rather than kept in a collection.
 */
export interface UploadTicket {
  tenantId: string;
  /** The storage object key this upload is writing to. */
  key: string;
  /** The provider's multipart id (S3). Azure derives blocks from the key. */
  uploadId: string;
  /** Display name, already charset-repaired. */
  name: string;
  /** The type the upload was *classified* as, not what the browser claimed. */
  contentType: string;
  /** Total bytes the client declared, already checked against the tenant cap. */
  size: number;
  /** Epoch ms after which this ticket is refused. */
  exp: number;
}

/**
 * Sign a ticket. **Deliberately not a JWT** — a token signed with the auth
 * secret that happens to carry a `tenantId` is one strategy tweak away from
 * being accepted as a session. This format can't be mistaken for one, and the
 * context string means the same secret produces a different signature here
 * than anywhere else.
 *
 * There's no upload-session collection because there's nothing worth storing:
 * the provider already holds the real state (the multipart upload), a second
 * copy could only drift, and a stateless ticket means any API replica can take
 * any chunk — no sticky sessions, no TTL sweeper, no migration.
 */
export function signUploadTicket(ticket: UploadTicket): string {
  const body = b64url(Buffer.from(JSON.stringify(ticket), 'utf8'));
  return `${body}.${b64url(mac(body))}`;
}

/** Verify a ticket and return it. Throws if it's forged, malformed or expired. */
export function readUploadTicket(token: string | undefined, tenantId: string): UploadTicket {
  const [body, signature] = (token || '').split('.');
  if (!body || !signature) throw new ForbiddenException('Missing or malformed upload ticket.');

  const expected = mac(body);
  const given = Buffer.from(signature, 'base64url');
  // Length-check first: timingSafeEqual throws on a mismatch rather than
  // returning false, which would turn a forged ticket into a 500.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new ForbiddenException('Invalid upload ticket.');
  }

  let ticket: UploadTicket;
  try {
    ticket = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as UploadTicket;
  } catch {
    throw new ForbiddenException('Invalid upload ticket.');
  }

  if (ticket.exp < Date.now()) {
    throw new ForbiddenException('This upload took too long — start it again.');
  }
  // The signature proves the ticket is ours; this proves it's *theirs*. Without
  // it, a ticket leaked from one workspace would write into another's storage.
  if (ticket.tenantId !== tenantId) throw new ForbiddenException('Invalid upload ticket.');
  return ticket;
}

/** When a ticket minted now should stop working. */
export function ticketExpiry(): number {
  return Date.now() + TICKET_TTL_MS;
}

/** How many chunks a file of this size is split into. */
export function partCount(size: number): number {
  return Math.max(1, Math.ceil(size / CHUNK_SIZE));
}

function mac(body: string): Buffer {
  return createHmac('sha256', jwtConstants.secret).update(`${CONTEXT}.${body}`).digest();
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}
