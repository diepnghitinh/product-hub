import { customAlphabet } from 'nanoid';

/**
 * Human-friendly short id for test cases (e.g. `TC-4F9K2`). Not globally unique —
 * unique enough within a report; the internal UUID remains the real identity.
 */
export function shortId(prefix = 'TC'): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${rand}`;
}

// Unambiguous uppercase alphabet — no 0/O/1/I/L, so a ref is safe to read aloud,
// type, and drop into a URL. 31 symbols ^ 7 ≈ 27.5 billion ids per prefix.
const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const REF_LEN = 7;
const nano = customAlphabet(REF_ALPHABET, REF_LEN);

/**
 * A random, unguessable URL ref for a task/bug, e.g. `TSK-6HCUHKX` / `BUG-WHHY3ZV`.
 * Uppercase on purpose: it matches the look of the legacy sequential ids and
 * survives the frontend's ref-uppercasing (see `taskRefsInText`). The prefix
 * names the type; the suffix is nanoid-random.
 */
export function randomRef(prefix: string): string {
  return `${prefix}-${nano()}`;
}

// A share link is pasted into chat, read off a screen and typed by hand, so it
// uses the same unambiguous alphabet rather than a 36-character UUID. Longer
// than a ref because the token *is* the access control: 31^14 ≈ 7.6 × 10^20
// keeps it unguessable while still fitting in a glance.
const SHARE_LEN = 14;
const nanoShare = customAlphabet(REF_ALPHABET, SHARE_LEN);

/** A fresh public-share token, e.g. `K7M4PQ2XR9TVBD`. */
export function shareToken(): string {
  return nanoShare();
}

/**
 * The token to (re)enable a share link with: whatever it already had, so links
 * handed out earlier keep working — unless that's a legacy UUID, which is
 * upgraded to a short one. The hyphen is the tell; the short alphabet has none.
 */
export function keepOrUpgradeShareToken(current: string | null | undefined): string {
  return current && !current.includes('-') ? current : shareToken();
}

/**
 * A `randomRef` proven free for this caller (per tenant, via `exists`). A
 * collision is astronomically unlikely and the DB has a unique index as the
 * hard backstop, but a create must never fail on the ~1-in-27-billion chance,
 * so we retry a few times and — in the practically-impossible case they all
 * collide — widen the suffix, which makes a repeat essentially impossible.
 */
export async function uniqueRef(
  prefix: string,
  exists: (ref: string) => Promise<boolean>,
): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const ref = randomRef(prefix);
    if (!(await exists(ref))) return ref;
  }
  return `${prefix}-${customAlphabet(REF_ALPHABET, 12)()}`;
}
