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
