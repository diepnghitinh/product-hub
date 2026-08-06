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
 * Every issue ref mentioned in a piece of free text — a git branch name, a
 * merge-request title, a commit message — uppercased and de-duplicated.
 *
 * This is the whole of how a pipeline finds its issue: nobody links anything by
 * hand, they just name the branch `feat/TSK-6HCUHKX-import-parser` the way
 * `issueBranchName` already suggests, and the CI label follows.
 *
 * Matches both ref generations — the random suffix minted by {@link randomRef}
 * and the legacy sequential ids (`TSK-7`) — because both are still live in
 * URLs and branch names. A ref that doesn't resolve is simply dropped by the
 * lookup, so the pattern errs wide rather than clever: it has no way to know
 * which ids a tenant actually has.
 */
export function issueRefsInText(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  // Case-insensitive, because a branch is very often all-lowercase
  // (`fix/tsk-6hcuhkx-retry`) even when the ref that named it wasn't — the match
  // is uppercased below, so the lookup still sees the canonical ref.
  //
  // The suffix is either all digits (a legacy sequential id, `TSK-7`) or 7-12
  // characters (a `randomRef`, widened to 12 only on collision). Nothing
  // shorter, which is what stops the case-insensitive form from reading
  // `bug-fix` and `bug-report` — ordinary branch names — as issue refs.
  //
  // The trailing boundary is what lets `TSK-6HCUHKX-import-parser` end at the
  // ref: a hyphen is a word boundary, so the branch's own words never run in.
  const re = /\b(TSK|BUG)-(\d+|[A-Za-z0-9]{7,12})\b/gi;
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(re)) found.add(`${m[1]}-${m[2]}`.toUpperCase());
  }
  return [...found];
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
