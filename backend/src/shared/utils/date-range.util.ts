/**
 * Turning a caller's date filter into Mongo bounds.
 *
 * A filter endpoint arrives in one of two shapes, and both have to work:
 *
 * - a **calendar date** (`2026-07-31`) — what an API/MCP caller or a hand-written
 *   URL uses. Read as that whole day in **UTC**, so `to` covers up to its last
 *   millisecond rather than snapping to midnight and cutting the day off.
 * - a full **instant** (`2026-07-31T17:00:00.000Z`) — what the app sends, because
 *   the browser resolves "31 July" against the *user's* timezone first. In
 *   UTC+7 that day starts at 17:00Z the day before, and reading it as a bare UTC
 *   date would drop a bug fixed at 9am local out of its own day.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parse(value: string | undefined, dayEnd: boolean): Date | undefined {
  if (!value) return undefined;
  const iso = DATE_ONLY.test(value)
    ? `${value}T${dayEnd ? '23:59:59.999' : '00:00:00.000'}Z`
    : value;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * `{ $gte, $lte }` for a from/to pair, or `undefined` when neither end is set
 * (so the caller can skip the field entirely rather than match on an empty
 * object). Either end alone is valid: an open-ended range.
 */
export function dateRangeFilter(
  from?: string,
  to?: string,
): { $gte?: Date; $lte?: Date } | undefined {
  const $gte = parse(from, false);
  const $lte = parse(to, true);
  if (!$gte && !$lte) return undefined;
  return { ...($gte && { $gte }), ...($lte && { $lte }) };
}
