/**
 * Date-only arithmetic for cycles. Everything works on ISO `YYYY-MM-DD` strings
 * (the same convention as issue start/end dates) and does its math in UTC
 * milliseconds, so cycle boundaries never shift across DST changes.
 */

const DAY_MS = 86_400_000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DD` → UTC midnight ms. */
export function parseISODate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

/** UTC ms → `YYYY-MM-DD`. */
export function toISODate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Today as `YYYY-MM-DD` in server-local time — "the date people are living in". */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  return toISODate(parseISODate(iso) + days * DAY_MS);
}

/** ISO weekday of a date: 1 = Monday … 7 = Sunday (the `cycleStartDay` scale). */
export function isoWeekday(iso: string): number {
  const jsDay = new Date(parseISODate(iso)).getUTCDay(); // 0 = Sunday … 6
  return jsDay === 0 ? 7 : jsDay;
}

/** The most recent `startDay` on or before `iso` — where a cycle containing
 *  `iso` would start. Returns `iso` itself when it falls on the start day. */
export function startDayOnOrBefore(iso: string, startDay: number): string {
  const diff = (isoWeekday(iso) - startDay + 7) % 7;
  return addDays(iso, -diff);
}

/** Inclusive whole days between two dates (same day = 1). */
export function inclusiveDays(startIso: string, endIso: string): number {
  return Math.round((parseISODate(endIso) - parseISODate(startIso)) / DAY_MS) + 1;
}
