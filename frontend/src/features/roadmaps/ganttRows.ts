import { GANTT_DAY, firstEpoch, isEpoch, toEpoch, type GanttRow } from '@/components/GanttChart';
import { UNASSIGNED } from '@/components/FilterMenu';
import { t } from '@/i18n';
import { formatDate } from '@/lib/format';
import type { RoadmapItem } from '@/types/dto';

/**
 * What the two roadmap timelines agree on.
 *
 * `RoadmapGantt` draws one roadmap; `AllRoadmapsGantt` draws every roadmap at
 * once. They label their rows differently — only the second one has a roadmap to
 * name — but *where a row lands on the axis* has to be the same answer in both,
 * or the same item would appear to be scheduled differently depending on which
 * screen you opened. That rule lives here, once.
 */

/** The window a bar was dragged to, in the ISO day shape the API stores. The same
 *  two fields on an issue and on a backlog item, so one drag handler shape serves both. */
export interface DateWindow {
  startDate: string;
  endDate: string;
}

/** Epoch ms back to an ISO day. `toEpoch` reads `YYYY-MM-DD` as UTC midnight and
 *  a drag only ever adds whole days, so this round-trips exactly. */
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Anyone named on a timeline row. An issue's `assignees` and a roadmap item's
 *  are the same `{ id, name }` pair, so one rule covers both kinds of row. */
export interface RowPerson {
  id: string;
  name: string;
}

/**
 * Does this row survive the **Assignee** filter?
 *
 * One rule for both timelines, and the same rule the row *displays*: a row is
 * kept when someone picked is named on it. `UNASSIGNED` is a person too — the
 * absence of one — so "who has nothing on them?" and "what has nobody on it?"
 * are the same question asked from either end.
 *
 * No filter picked → everything passes, so a caller can hand the selection
 * straight through without branching.
 */
export function matchesPeople(picked: string[] | undefined, people: RowPerson[]): boolean {
  if (!picked?.length) return true;
  if (!people.length) return picked.includes(UNASSIGNED);
  return people.some((p) => picked.includes(p.id));
}

/** The subset of an issue a timeline row needs. `TaskDto`, `BugDto` and the
 *  unified `IssueDto` all satisfy it structurally (only a task has `dueDate`). */
export interface DatedIssue {
  startDate?: string;
  endDate?: string;
  /** Task-only legacy mirror of `endDate`, kept as a fallback for rows saved
   *  before the rename. */
  dueDate?: string;
}

export const issueStart = (i: DatedIssue) => toEpoch(i.startDate);
export const issueEnd = (i: DatedIssue) => firstEpoch(i.endDate, i.dueDate);

/** The date an issue sits at — its start, else its end. */
export function issueAnchor(i: DatedIssue): number {
  const s = issueStart(i);
  return isEpoch(s) ? s : issueEnd(i);
}

/** Dated first (soonest at top), undated last. */
export function byIssueDate(a: DatedIssue, b: DatedIssue): number {
  const da = issueAnchor(a);
  const db = issueAnchor(b);
  if (isEpoch(da) && isEpoch(db)) return da - db;
  return isEpoch(da) ? -1 : isEpoch(db) ? 1 : 0;
}

/**
 * An item is placed by its own dates and nothing else. `startedAt`/`completedAt`
 * stand in because they are dates the item recorded about itself; `createdAt`,
 * today and "+2 weeks" used to fill the gaps, which drew a confident two-week bar
 * for an item nobody had scheduled. That bar was a guess wearing the same clothes
 * as a plan, and there is no way to tell them apart by looking.
 */
export function itemWindow(item: RoadmapItem): { start: number; end: number } {
  return {
    start: firstEpoch(item.startDate, item.startedAt),
    end: firstEpoch(item.endDate, item.completedAt),
  };
}

/** The date an item sits at — the same start-else-end rule an issue follows. */
export function itemAnchor(item: RoadmapItem): number {
  const { start, end } = itemWindow(item);
  return isEpoch(start) ? start : end;
}

export interface Placement {
  start: number;
  end: number;
  color: string;
  /** 0–100 → the bar becomes a track with a fill (the roadmap "progress" look).
   *  Omit for the solid block an issue's schedule gets. */
  progress?: number;
  /** Names the row in every tooltip. */
  label: string;
  /** Appended after the dates — an issue's status label. */
  suffix?: string;
  /** Present → the bar can be dragged/resized to a new window. */
  onChange?: (next: DateWindow) => void;
}

/**
 * Turn a start/end pair into the bar, marker or empty note a row gets.
 *
 * **Nothing is drawn from a date nobody set.** One rule, applied everywhere: two
 * dates → a bar, one date → a diamond on it, neither → the row is listed but not
 * placed. A chart that invents a window is worse than a chart with a gap in it —
 * the gap is the true answer to "when is this happening?", and it's the one that
 * makes someone go and schedule the thing.
 */
export function placeOnAxis({
  start,
  end: rawEnd,
  color,
  progress,
  label,
  suffix,
  onChange,
}: Placement): Pick<GanttRow, 'bar' | 'marker' | 'emptyText' | 'onBarChange'> {
  const tail = suffix ? ` · ${suffix}` : '';
  // Guard odd data (an end before the start) — but only between two real dates,
  // so a one-date row still falls through to its diamond.
  const end = isEpoch(start) && isEpoch(rawEnd) && rawEnd < start ? start + GANTT_DAY : rawEnd;

  if (isEpoch(start) && isEpoch(end)) {
    const range = `${formatDate(new Date(start))} – ${formatDate(new Date(end))}`;
    return {
      bar: {
        start,
        end,
        color,
        ...(progress !== undefined && { progress }),
        tooltip: `${label} · ${range}${tail}`,
      },
      // Drag moves a window that exists. An unscheduled row has nothing to take
      // hold of, so its dates are set in the detail panel — which is also the
      // only place they can be set deliberately rather than by nudging a bar.
      ...(onChange && {
        onBarChange: (n: { start: number; end: number }) =>
          onChange({ startDate: isoDay(n.start), endDate: isoDay(n.end) }),
      }),
    };
  }
  if (isEpoch(end)) {
    const when = t('roadmaps.ganttDue').replace('{date}', formatDate(new Date(end)));
    return { marker: { at: end, color, tooltip: `${label} · ${when}${tail}` } };
  }
  if (isEpoch(start)) {
    const when = t('roadmaps.ganttStarts').replace('{date}', formatDate(new Date(start)));
    return { marker: { at: start, color, tooltip: `${label} · ${when}${tail}` } };
  }
  return { emptyText: t('roadmaps.ganttNoDates') };
}
