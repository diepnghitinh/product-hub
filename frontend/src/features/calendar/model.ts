import type { TaskDto } from '@/types/dto';

/**
 * The calendar's date arithmetic and bar layout — pure functions, no React.
 *
 * Every date here is a **local calendar day** as ISO `YYYY-MM-DD`, the same shape
 * a task stores. Days are compared as strings and built with the local `Date`
 * constructor, never via `toISOString()`: a task due "the 3rd" is the 3rd in the
 * user's timezone, and a UTC round-trip is what shifts it to the 2nd for anyone
 * west of Greenwich.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** Local `YYYY-MM-DD` for a Date — the inverse of {@link parseISO}. */
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** `YYYY-MM-DD` (or a longer ISO string, truncated) → a local midnight Date. */
export function parseISO(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const todayISO = () => toISO(new Date());

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/**
 * Whole days from `a` to `b` (negative when `b` is earlier). Both are moved to
 * midday first: a day that is 23 or 25 hours long because the clocks changed
 * would otherwise round to the wrong number of days.
 */
export function diffDays(a: string, b: string): number {
  const da = parseISO(a);
  const db = parseISO(b);
  if (!da || !db) return 0;
  da.setHours(12, 0, 0, 0);
  db.setHours(12, 0, 0, 0);
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/** The Sunday of `iso`'s week — matching `DatePicker`/`DateRangePicker`, which
 *  both draw Sunday-first grids, so every date surface in the app agrees. */
export function startOfWeek(iso: string): string {
  const d = parseISO(iso);
  if (!d) return iso;
  d.setDate(d.getDate() - d.getDay());
  return toISO(d);
}

export function startOfMonth(iso: string): string {
  const d = parseISO(iso);
  return d ? toISO(new Date(d.getFullYear(), d.getMonth(), 1)) : iso;
}

/** `n` months on, always landing on the 1st — the anchor a month view is kept at,
 *  so stepping from the 31st never skips a short month. */
export function addMonths(iso: string, months: number): string {
  const d = parseISO(iso);
  return d ? toISO(new Date(d.getFullYear(), d.getMonth() + months, 1)) : iso;
}

export const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);

/** The 7 days of `anchor`'s week, Sunday first. */
export function weekDays(anchor: string): string[] {
  const first = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/**
 * The weeks a month grid draws — from the Sunday on or before the 1st to the
 * Saturday on or after the last, so the leading and trailing days of the
 * neighbouring months fill the corners. Four to six rows depending on the month;
 * the grid gives each row an equal share of a fixed height, so the page itself
 * never changes size.
 */
export function monthWeeks(anchor: string): string[][] {
  const first = parseISO(startOfMonth(anchor));
  if (!first) return [];
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const from = startOfWeek(toISO(first));
  const to = addDays(startOfWeek(toISO(last)), 6);
  const rows = diffDays(from, to) / 7 + 1;
  return Array.from({ length: rows }, (_, w) => weekDays(addDays(from, w * 7)));
}

/** Inclusive run of days a task occupies. */
export interface Span {
  start: string;
  end: string;
}

/**
 * Where a task sits on the calendar, or `null` when it has no dates at all —
 * those are the "unscheduled" ones, deliberately absent from the grid rather
 * than parked on today.
 *
 * A task with both ends spans them; one end alone is a single day. `dueDate` is
 * only read as a fallback for `endDate`: it's the legacy mirror of the same
 * field (kept in sync server-side), so a row written before the rename still
 * lands on the right day.
 */
export function taskSpan(task: TaskDto): Span | null {
  const start = (task.startDate || '').slice(0, 10);
  const end = (task.endDate || task.dueDate || '').slice(0, 10);
  if (start && end) return start <= end ? { start, end } : { start: end, end: start };
  if (end) return { start: end, end };
  if (start) return { start, end: start };
  return null;
}

/** One task's bar within one week row. Generic over the task, so a caller that
 *  hands in a richer row (the calendar's `CalendarTask`, which knows which list
 *  it came from) gets that row back rather than a widened `TaskDto`. */
export interface Segment<T extends TaskDto = TaskDto> {
  task: T;
  /** Inclusive column indices in the week, 0 (Sunday) – 6. */
  from: number;
  to: number;
  /** Which stacked row inside the week the bar sits on, 0-based. */
  lane: number;
  /** The task runs on past this week's edge — the bar is drawn cut off there. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

/**
 * Pack a week's tasks into stacked lanes: every bar gets the topmost lane where
 * nothing it overlaps already sits, which is what keeps a long task's bar
 * unbroken across the days it covers instead of it being re-listed per day.
 *
 * Sorted by start, then longest-first, then title — so the same set of tasks
 * always lays out identically, and the long-running work reads as the top band
 * with the short items tucked beneath it. Ties are broken by title (not id) so
 * the order is the one the eye can predict.
 */
export function packWeek<T extends TaskDto>(tasks: T[], days: string[]): Segment<T>[] {
  const first = days[0];
  const last = days[days.length - 1];

  const spans = tasks
    .map((task) => ({ task, span: taskSpan(task) }))
    .filter((x): x is { task: T; span: Span } => !!x.span)
    .filter(({ span }) => span.start <= last && span.end >= first)
    .sort((a, b) => {
      if (a.span.start !== b.span.start) return a.span.start < b.span.start ? -1 : 1;
      const lenA = diffDays(a.span.start, a.span.end);
      const lenB = diffDays(b.span.start, b.span.end);
      if (lenA !== lenB) return lenB - lenA;
      return a.task.title.localeCompare(b.task.title);
    });

  // Last column each lane is occupied up to. Sorted by start, so a lane is free
  // from `from` onwards exactly when its end is behind it.
  const laneEnds: number[] = [];
  return spans.map(({ task, span }) => {
    const from = Math.max(0, diffDays(first, span.start));
    const to = Math.min(days.length - 1, diffDays(first, span.end));
    let lane = laneEnds.findIndex((end) => end < from);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(-1);
    }
    laneEnds[lane] = to;
    return {
      task,
      from,
      to,
      lane,
      clippedStart: span.start < first,
      clippedEnd: span.end > last,
    };
  });
}

/**
 * The dates a drag writes when a bar is dropped on `day`: the task keeps its
 * length and *begins* there. Dropping is a "move it to here" gesture, so the day
 * under the cursor becomes the task's first day — anything else (shifting by the
 * grab offset, say) makes short drags land somewhere the user didn't point at.
 *
 * A task with only an end date keeps having only an end date: scheduling and
 * re-scheduling shouldn't quietly invent a start the user never set.
 */
export function rescheduleTo(task: TaskDto, day: string): { startDate?: string; endDate?: string } {
  const start = (task.startDate || '').slice(0, 10);
  const end = (task.endDate || task.dueDate || '').slice(0, 10);
  if (start && end)
    return { startDate: day, endDate: addDays(day, Math.abs(diffDays(start, end))) };
  if (end) return { endDate: day };
  return { startDate: day };
}
