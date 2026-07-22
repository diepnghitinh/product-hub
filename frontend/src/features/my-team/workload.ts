import { IssueKind, TaskStatus, type TeamStatusConfig } from '@/types/enums';
import type { IssueDto } from '@/types/dto';

/** Bucket id for issues with no assignee — kept distinct from any real user id. */
export const UNASSIGNED_ID = '__unassigned__';

/**
 * Initials from a display name. `lib/format`'s `initials` needs an email too (it
 * falls back to the address); here we only ever have `assigneeName`, so this
 * name-only variant avoids passing a fake email through.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A team column paired with the person's issues sitting in it. */
export interface ColumnBucket {
  col: TeamStatusConfig;
  tasks: IssueDto[];
}

/**
 * One person's slice of a team's board — the shape the Box view's cards and the
 * Workload summary both read from. "Done" is the board's terminal column
 * (`doneKey`): a task board's built-in `DONE`, or a bug board's last column (e.g.
 * `closed`), so a bug team's progress isn't stuck at 0%. Effort is in **story
 * points** (`estimate`), the only size we track — bugs carry none, so a bug
 * team's points and no-estimate caveat both stay silent.
 */
export interface PersonWorkload {
  /** Assignee id, or `UNASSIGNED_ID`. */
  id: string;
  name: string;
  isUnassigned: boolean;
  tasks: IssueDto[];
  /** The column key treated as "complete" on this board (see `doneKeyOf`). */
  doneKey: string;
  doneCount: number;
  notDoneCount: number;
  total: number;
  donePoints: number;
  totalPoints: number;
  remainingPoints: number;
  /** Tasks with no estimate set — surfaced as a caveat, like the reference. */
  noEstimateCount: number;
  /** Share complete, by issue count (0–100). */
  progressPct: number;
  /** Per-column split, in the board's column order. */
  byColumn: ColumnBucket[];
}

const pointsOf = (t: IssueDto) => (t.estimate > 0 ? t.estimate : 0);

/**
 * The column that means "complete". A task board has an explicit `done` column;
 * a bug board doesn't, so its terminal column (last in order, e.g. `closed`)
 * counts as done — otherwise a bug team's progress would be stuck at 0%.
 */
function doneKeyOf(columns: TeamStatusConfig[]): string {
  if (columns.some((c) => c.key === TaskStatus.DONE)) return TaskStatus.DONE;
  return columns[columns.length - 1]?.key ?? TaskStatus.DONE;
}

function buildPerson(
  id: string,
  name: string,
  tasks: IssueDto[],
  columns: TeamStatusConfig[],
): PersonWorkload {
  const doneKey = doneKeyOf(columns);
  const done = tasks.filter((t) => t.status === doneKey);
  const totalPoints = tasks.reduce((s, t) => s + pointsOf(t), 0);
  const donePoints = done.reduce((s, t) => s + pointsOf(t), 0);
  const total = tasks.length;
  return {
    id,
    name,
    isUnassigned: id === UNASSIGNED_ID,
    tasks,
    doneKey,
    doneCount: done.length,
    notDoneCount: total - done.length,
    total,
    donePoints,
    totalPoints,
    remainingPoints: totalPoints - donePoints,
    // Only tasks are sized in points — bugs carry no estimate, so they don't
    // count as "missing" one (that would flag every bug on a QC board).
    noEstimateCount: tasks.filter((t) => t.kind === IssueKind.TASK && t.estimate <= 0).length,
    progressPct: total ? Math.round((done.length / total) * 100) : 0,
    byColumn: columns.map((col) => ({ col, tasks: tasks.filter((t) => t.status === col.key) })),
  };
}

/**
 * Group a team's issues into per-person workloads — the app has no team-membership
 * model, so "people" are exactly whoever is assigned to the issues in view (plus an
 * Unassigned bucket). Busiest first so the fullest queues lead; Unassigned always
 * trails, as it's a bucket, not a person.
 */
export function groupByPerson(
  tasks: IssueDto[],
  columns: TeamStatusConfig[],
  unassignedLabel: string,
): PersonWorkload[] {
  const map = new Map<string, { name: string; tasks: IssueDto[] }>();
  for (const t of tasks) {
    const id = t.assigneeId || UNASSIGNED_ID;
    const name = t.assigneeId ? t.assigneeName || t.assigneeId : unassignedLabel;
    const entry = map.get(id) ?? { name, tasks: [] };
    entry.tasks.push(t);
    map.set(id, entry);
  }
  return [...map.entries()]
    .map(([id, { name, tasks: ts }]) => buildPerson(id, name, ts, columns))
    .sort((a, b) => {
      if (a.isUnassigned !== b.isUnassigned) return a.isUnassigned ? 1 : -1;
      if (b.total !== a.total) return b.total - a.total;
      return a.name.localeCompare(b.name);
    });
}
