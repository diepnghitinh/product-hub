import { createHmac } from 'node:crypto';
import { secretsMatch } from './pipeline-event.parser';

/**
 * Reading ClickUp's side of the wire: what an admin pasted into the link box,
 * and whether an inbound delivery is really from ClickUp.
 *
 * Pure functions over strings and `unknown` — no Nest, no database, no network,
 * mirroring `pipeline-event.parser` next door. Every claim about a delivery is
 * decided here so the use-case only has to do the writing.
 */

/** Narrow an unknown payload without pulling in a schema library. */
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** What a pasted ClickUp reference resolved to. */
export interface ClickUpTaskRef {
  /** The id to ask ClickUp for. */
  id: string;
  /**
   * True when `id` is a workspace-scoped custom id (`DEV-123`) rather than a
   * ClickUp id. The read then needs `custom_task_ids=true` **and** the workspace
   * id — without both, ClickUp 404s a perfectly valid custom id.
   */
  customId: boolean;
}

/**
 * What an admin pastes, resolved to something we can ask ClickUp for.
 *
 * The forms that have to work, because they're the ones people actually have on
 * their clipboard:
 * - `https://app.clickup.com/t/86abc123` — the plain task link
 * - `https://app.clickup.com/t/9008152/DEV-123` — a link to a *custom* id, where
 *   the first segment is the workspace, not the task
 * - `86abc123` / `#86abc123` — the id on its own, from ClickUp's "copy id"
 * - `DEV-123` — a bare custom id
 *
 * Returns `null` for anything else, including a ClickUp URL that isn't a task
 * (a list or a view). Guessing at those would produce a confident 404 later,
 * which is a worse error than "that doesn't look like a task link".
 */
export function parseClickUpTaskRef(input: string): ClickUpTaskRef | null {
  const raw = input.trim();
  if (!raw) return null;

  // A URL: only ever trust the `/t/` path — everything else on app.clickup.com
  // is a view of some kind, and its ids are not task ids.
  const url = raw.match(/^https?:\/\/[^/]*clickup\.com\/(.*)$/i);
  if (url) {
    const segments = url[1].split(/[?#]/)[0].split('/').filter(Boolean);
    const at = segments.indexOf('t');
    if (at === -1) return null;
    const after = segments.slice(at + 1);
    if (after.length === 0) return null;
    // Two segments after /t/ means workspace + custom id; one means a task id.
    const id = after.length >= 2 ? after[1] : after[0];
    return id ? { id, customId: after.length >= 2 && isCustomId(id) } : null;
  }

  // A bare id, with ClickUp's own "#" prefix stripped.
  const bare = raw.replace(/^#/, '');
  if (!/^[A-Za-z0-9_-]+$/.test(bare)) return null;
  return { id: bare, customId: isCustomId(bare) };
}

/**
 * A custom id looks like `DEV-123`: letters, a hyphen, digits. Native ClickUp
 * ids are lowercase base36 with no hyphen, so the two can't be confused.
 */
function isCustomId(id: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(id);
}

/**
 * Is this delivery really from ClickUp?
 *
 * ClickUp signs the raw body with the secret it minted when the webhook was
 * created and sends the hex HMAC-SHA256 in `X-Signature` (no `sha256=` prefix,
 * unlike GitHub). It has to be the *bytes as received* — re-serialising the
 * parsed JSON changes key order and whitespace, and the signature stops matching,
 * which is why `main.ts` stashes `rawBody` for this path too.
 */
export function verifyClickUpSignature(
  secret: string,
  headers: Record<string, string | string[] | undefined>,
  rawBody: Buffer | undefined,
): boolean {
  if (!secret || !rawBody) return false;
  const v = headers['x-signature'] ?? headers['X-Signature'];
  const sent = Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
  if (!sent) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return secretsMatch(expected, sent);
}

/** One inbound delivery, once its payload has been read. */
export interface ClickUpEvent {
  /** e.g. `taskStatusUpdated`. */
  event: string;
  taskId: string;
  /** The task no longer exists (or left the workspace) — mirror it as gone. */
  deleted: boolean;
}

/**
 * Read a ClickUp webhook payload.
 *
 * Deliberately shallow: we take the event name and the task id and nothing else.
 * ClickUp also sends `history_items` describing the change, and applying those
 * as a delta would be both more code and less correct — one dropped or
 * out-of-order delivery would leave the snapshot permanently wrong. Re-reading
 * the task is idempotent and self-healing, so that's what the use-case does.
 *
 * Returns `null` for a payload we don't understand, which the caller treats as a
 * no-op rather than an error: ClickUp retries and eventually disables a webhook
 * that keeps failing, and "sync silently stopped" is far worse than "we ignored
 * an event we had nothing to say about".
 */
export function parseClickUpEvent(body: unknown): ClickUpEvent | null {
  const payload = obj(body);
  const event = str(payload.event);
  const taskId = str(payload.task_id);
  if (!event || !taskId) return null;
  return { event, taskId, deleted: event === 'taskDeleted' };
}
