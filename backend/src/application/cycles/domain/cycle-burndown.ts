/**
 * Burn-up reconstruction for a cycle. There is no per-issue status history in the
 * store (an issue keeps only its current `status` + `updatedAt`), so the daily
 * curve is *reconstructed* from timestamps, not read from snapshots:
 *
 *   • scope(day)     = issues whose `createdAt` ≤ day       (entered the plan)
 *   • started(day)   = issues past the first column, timed by `updatedAt`
 *   • completed(day) = done issues, timed by `updatedAt`    (the completion proxy)
 *
 * `updatedAt` is an approximation of "when it was completed/started" — a done
 * issue edited later reads as finishing later. It's the best signal available and
 * matches what lightweight trackers show; the endpoint documents the caveat.
 *
 * Pure and date-only (UTC `YYYY-MM-DD`), mirroring {@link ./cycle-dates}, so it's
 * unit-testable without a DB.
 */
import { addDays, inclusiveDays, parseISODate, toISODate } from './cycle-dates';

const DAY_MS = 86_400_000;

/** The projected issue fields the burn-up needs — one row per cycle member. */
export interface BurndownIssueRow {
  createdAt: Date;
  updatedAt: Date;
  status: string;
  /** Story points; 0 = unset (bug teams have no estimates → all 0). */
  estimate: number;
  assigneeId: string;
  assigneeName: string;
  labelKeys: string[];
  projectId: string;
}

/** One day on the x-axis, carrying both units so the client picks per team. */
export interface BurndownPoint {
  date: string;
  scopeCount: number;
  scopePoints: number;
  startedCount: number;
  startedPoints: number;
  completedCount: number;
  completedPoints: number;
}

/** A breakdown row (one assignee / label / project) — a current snapshot, not a
 *  series. `label`/`color` are resolved where cheap (assignee name is denormalised,
 *  labels come from the team); '' means "resolve on the client" (projects). */
export interface BurndownGroup {
  key: string;
  label: string;
  color: string;
  count: number;
  points: number;
  completedCount: number;
  completedPoints: number;
}

export interface BurndownResult {
  unit: 'points' | 'count';
  scopeCount: number;
  scopePoints: number;
  startedCount: number;
  startedPoints: number;
  completedCount: number;
  completedPoints: number;
  series: BurndownPoint[];
  assignees: BurndownGroup[];
  labels: BurndownGroup[];
  projects: BurndownGroup[];
}

export interface BuildBurndownInput {
  startDate: string;
  endDate: string;
  rows: BurndownIssueRow[];
  /** Statuses that count as finished (from `completedStatusKeysFor`). */
  completedKeys: string[];
  /** The team's first board column — "not started" is exactly this one; every
   *  other status (in-progress, custom, done) counts as started. */
  unstartedKey: string;
  /** key → {name,color} for the team's labels, to resolve the label breakdown. */
  labelLookup: Record<string, { name: string; color: string }>;
}

/** Clamp an event's ISO day into the cycle window: a member carried in from an
 *  earlier cycle (created before it started) counts from day 0; nothing draws
 *  past the last day. */
function clampDay(iso: string, startDate: string, endDate: string): string {
  if (iso < startDate) return startDate;
  if (iso > endDate) return endDate;
  return iso;
}

/** Whole-day offset of `iso` from `startDate`, clamped into `[0, span)`. */
function dayIndex(iso: string, startDate: string, span: number): number {
  const i = Math.round((parseISODate(iso) - parseISODate(startDate)) / DAY_MS);
  return i < 0 ? 0 : i >= span ? span - 1 : i;
}

/** Sort a breakdown: biggest first (by the active unit), the "none" bucket last. */
function sortGroups(groups: BurndownGroup[], unit: 'points' | 'count'): BurndownGroup[] {
  return groups.sort((a, b) => {
    if (!a.key !== !b.key) return a.key ? -1 : 1; // '' (none) sinks to the bottom
    return unit === 'points' ? b.points - a.points : b.count - a.count;
  });
}

export function buildBurndown(input: BuildBurndownInput): BurndownResult {
  const { startDate, endDate, rows, completedKeys, unstartedKey, labelLookup } = input;
  const completed = new Set(completedKeys);
  // A cycle is always ≥1 day; guard a reversed window defensively.
  const span = Math.max(1, inclusiveDays(startDate, endDate));

  // Per-day increments; prefix-summed into cumulative series below.
  const add = () => new Array<number>(span).fill(0);
  const scopeC = add();
  const scopeP = add();
  const startedC = add();
  const startedP = add();
  const completedC = add();
  const completedP = add();

  // Breakdown accumulators (current snapshot — every member counts once).
  const assignees = new Map<string, BurndownGroup>();
  const labels = new Map<string, BurndownGroup>();
  const projects = new Map<string, BurndownGroup>();
  const bump = (
    map: Map<string, BurndownGroup>,
    key: string,
    label: string,
    color: string,
    points: number,
    done: boolean,
  ) => {
    const g =
      map.get(key) ??
      (map
        .set(key, { key, label, color, count: 0, points: 0, completedCount: 0, completedPoints: 0 })
        .get(key) as BurndownGroup);
    g.count += 1;
    g.points += points;
    if (done) {
      g.completedCount += 1;
      g.completedPoints += points;
    }
  };

  for (const r of rows) {
    const pts = r.estimate > 0 ? r.estimate : 0;
    const isDone = completed.has(r.status);
    const isStarted = r.status !== unstartedKey; // done ⊂ started
    const created = clampDay(toISODate(r.createdAt.getTime()), startDate, endDate);
    const touched = clampDay(toISODate(r.updatedAt.getTime()), startDate, endDate);

    const ci = dayIndex(created, startDate, span);
    scopeC[ci] += 1;
    scopeP[ci] += pts;
    if (isStarted) {
      const si = dayIndex(touched, startDate, span);
      startedC[si] += 1;
      startedP[si] += pts;
    }
    if (isDone) {
      const di = dayIndex(touched, startDate, span);
      completedC[di] += 1;
      completedP[di] += pts;
    }

    // Snapshot breakdowns.
    bump(assignees, r.assigneeId, r.assigneeName, '', pts, isDone);
    if (r.labelKeys.length) {
      for (const k of r.labelKeys) {
        const meta = labelLookup[k];
        bump(labels, k, meta?.name ?? k, meta?.color ?? '', pts, isDone);
      }
    } else {
      bump(labels, '', '', '', pts, isDone); // "No label"
    }
    bump(projects, r.projectId, '', '', pts, isDone);
  }

  // Prefix-sum the increments into cumulative running totals.
  const series: BurndownPoint[] = [];
  let sc = 0;
  let sp = 0;
  let stc = 0;
  let stp = 0;
  let cc = 0;
  let cp = 0;
  for (let i = 0; i < span; i++) {
    sc += scopeC[i];
    sp += scopeP[i];
    stc += startedC[i];
    stp += startedP[i];
    cc += completedC[i];
    cp += completedP[i];
    series.push({
      date: addDays(startDate, i),
      scopeCount: sc,
      scopePoints: sp,
      startedCount: stc,
      startedPoints: stp,
      completedCount: cc,
      completedPoints: cp,
    });
  }

  // Points are only meaningful when the team estimates; else the client shows counts.
  const unit: 'points' | 'count' = sp > 0 ? 'points' : 'count';

  return {
    unit,
    scopeCount: sc,
    scopePoints: sp,
    startedCount: stc,
    startedPoints: stp,
    completedCount: cc,
    completedPoints: cp,
    series,
    assignees: sortGroups([...assignees.values()], unit),
    labels: sortGroups([...labels.values()], unit),
    projects: sortGroups([...projects.values()], unit),
  };
}
