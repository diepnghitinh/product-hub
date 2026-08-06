import { TaskStatus } from '@/types/enums';
import type { CalendarTask } from './api';
import { addDays, diffDays, taskSpan, todayISO } from './model';

/**
 * The workload layer — what turns the **assigned** calendar from "days with
 * titles on them" into "how much work is on me, and what's late".
 *
 * Only the assigned scope uses it. A personal task has no team, no estimate and
 * no cycle, so every field here would be empty on one; the personal calendar
 * deliberately keeps the plainer grid.
 *
 * Pure functions, like `model.ts` — no React, no queries.
 */

/** How much work sits on one day. */
export interface DayLoad {
  /**
   * Points on this day. A task's estimate is **spread evenly over the days it
   * spans**, so a 5-day 8-point task counts 1.6 a day rather than 8 on each of
   * five days. Counting it whole every day is what makes a workload view
   * unreadable: a single long task would out-weigh a genuinely packed week.
   */
  points: number;
  /** Tasks touching this day, whatever their estimate. */
  count: number;
  /** …of those, how many are past their end date and unfinished. */
  overdue: number;
}

export interface CalendarLoad {
  byDay: Map<string, DayLoad>;
  /**
   * The busiest day in view. Load bars are drawn **relative to this**, not
   * against a capacity target, because the product models no per-person
   * capacity — there is no "40 points a week" anywhere in the data. Inventing
   * one would put a number on screen that nothing behind it supports, and a
   * workload view that lies is worse than no workload view.
   */
  peak: number;
  /** Unfinished work already past its end date, earliest deadline first. */
  overdue: CalendarTask[];
}

/**
 * Past its end date and not finished. Uses the same day-string comparison the
 * rest of the calendar does, so the boundary is local midnight — a task due
 * today is never "overdue" until tomorrow, in the user's own timezone.
 */
export function isOverdue(task: CalendarTask, today: string = todayISO()): boolean {
  if (task.status === TaskStatus.DONE) return false;
  const span = taskSpan(task);
  return !!span && span.end < today;
}

/**
 * Per-day load across the visible days, plus the period's overdue work.
 *
 * A task's contribution is clipped to the window before it's walked, so a task
 * that runs for a year costs the same as one that runs for a week — but its
 * *share* is still computed from the full span, so the points on a visible day
 * are right even when the task started months ago.
 */
export function buildLoad(tasks: CalendarTask[], days: string[]): CalendarLoad {
  const byDay = new Map<string, DayLoad>();
  const overdue: CalendarTask[] = [];
  if (!days.length) return { byDay, peak: 0, overdue };

  const first = days[0];
  const last = days[days.length - 1];
  const today = todayISO();

  for (const task of tasks) {
    const span = taskSpan(task);
    if (!span) continue;

    if (isOverdue(task, today)) overdue.push(task);

    // Clip to the window, then bail if the task never reaches it.
    const from = span.start > first ? span.start : first;
    const to = span.end < last ? span.end : last;
    if (to < from) continue;

    const share = (task.estimate || 0) / (diffDays(span.start, span.end) + 1);
    const late = isOverdue(task, today);

    for (let i = 0, steps = diffDays(from, to) + 1; i < steps; i++) {
      const day = addDays(from, i);
      const cur = byDay.get(day) ?? { points: 0, count: 0, overdue: 0 };
      cur.points += share;
      cur.count += 1;
      if (late) cur.overdue += 1;
      byDay.set(day, cur);
    }
  }

  overdue.sort((a, b) => {
    const ea = taskSpan(a)!.end;
    const eb = taskSpan(b)!.end;
    return ea === eb ? a.title.localeCompare(b.title) : ea < eb ? -1 : 1;
  });

  let peak = 0;
  for (const load of byDay.values()) peak = Math.max(peak, load.points);

  return { byDay, peak, overdue };
}

/** What a bar shows beyond its title, on the assigned calendar. */
export interface TaskChip {
  /** The owning team's stable slug (`qc`, `engineering`) — '' when unresolved. */
  teamKey: string;
  /** The team's display name, for the bar's tooltip where there's room for it. */
  teamName: string;
  /** Estimate in points; `0` means unset and is not drawn. */
  points: number;
  overdue: boolean;
}

/**
 * How much of a bar's extra detail fits, from the number of day columns it
 * covers. A one-day bar in a month cell is barely a hundred pixels wide — the
 * title has to win there, so the team key drops first and the points only
 * survive where there is genuinely room.
 */
export function chipDetail(columns: number, dense: boolean): 'full' | 'points' | 'none' {
  if (!dense) return columns >= 2 ? 'full' : 'points';
  if (columns >= 3) return 'full';
  return columns >= 2 ? 'points' : 'none';
}
