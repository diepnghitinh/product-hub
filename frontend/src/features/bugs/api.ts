import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { makeIssueHooks } from '@/features/issues/hook-factory';
import { IssueKind } from '@/types/enums';
import type { IssueSortDir, IssueSortField } from '@/features/issues/api';
import type { BugAttachment, BugDto, IssueStabilityDto } from '@/types/dto';
import type { BugSeverity, BugStatus, CustomFieldValue } from '@/types/enums';

/**
 * Bugs read/write the unified **`/issues`** collection (with `kind: bug`), not the
 * retired `/bugs` endpoint — `/issues` is authoritative. The fetch + optimistic cache
 * logic lives once in `makeIssueHooks`; this file only binds it to the bug cache
 * namespace (`['bugs']`/`['bug']`), `kind: bug`, and `BugDto` (a subset of the served
 * `IssueDto`), so every caller's hook names, params, return types and cache keys stay
 * exactly as they were.
 */

export interface BugQuery {
  /** Scope to a team's issue list. */
  teamId?: string;
  /** Multi-value — serialized as repeated keys (`?status=a&status=b`). */
  status?: BugStatus[];
  severity?: BugSeverity[];
  assigneeId?: string[];
  /** Who opened the bug — user id(s). */
  createdBy?: string[];
  projectId?: string[];
  /** Team cycle: a cycle id, or `current` / `upcoming` / `none` — the sentinels
   *  resolve server-side against `teamId`, so saved links never go stale. */
  cycleId?: string;
  caseId?: string;
  reportId?: string;
  search?: string;
  /** Opened on/after this instant (or `YYYY-MM-DD`, read as that UTC day). */
  createdFrom?: string;
  /** Opened on/before this instant — inclusive. */
  createdTo?: string;
  /** Solved (moved to resolved/closed) on/after this instant. Still-open bugs
   *  have no solved date, so either end on its own also excludes them. */
  resolvedFrom?: string;
  /** Solved on/before this instant — inclusive. */
  resolvedTo?: string;
  /**
   * The scheduled window, as plain `YYYY-MM-DD` days (no time, no zone — a
   * planned date means the same day everywhere). Matched by **overlap**, not
   * containment: anything whose start→end run touches the window at all, so an
   * issue that began before it and ends after it still counts as worked on
   * during it. `startDate`/`endDate` fall back to `dueDate`; an issue with no
   * date at all never matches.
   */
  scheduledFrom?: string;
  /** The window's closing day — inclusive. */
  scheduledTo?: string;
  /** Sort field. Omit to keep the board ordering (drag position, then newest first) —
   *  the kanban view must always omit it. */
  sort?: IssueSortField;
  /** Sort direction; defaults to `desc` server-side. */
  dir?: IssueSortDir;
}

export interface CreateBugInput {
  title: string;
  description?: string;
  severity?: BugSeverity;
  /** Built-in `BugStatus` or a team's custom column key. Defaults to the first column. */
  status?: string;
  type?: string;
  projectId?: string;
  caseId?: string;
  caseLabel?: string;
  reportId?: string;
  /** Everyone on it, primary first (`[]` unassigns); wins over `assigneeId`. */
  assigneeIds?: string[];
  assigneeId?: string;
  /** Start of the work window, ISO `YYYY-MM-DD`. */
  startDate?: string;
  /** End / target date, ISO `YYYY-MM-DD`. */
  endDate?: string;
  /**
   * The team whose list to create in. Must be sent from a team's board —
   * without it the API files the bug under the workspace's default bug team,
   * not the one you were looking at.
   */
  teamId?: string;
  /** Create straight into a team cycle (a board filtered to a cycle creates
   *  there). A concrete current/upcoming cycle id of the bug's team. */
  cycleId?: string;
  /** Files picked in the create form — already uploaded by the time this is sent. */
  attachments?: BugAttachment[];
}

export interface UpdateBugInput {
  title?: string;
  description?: string;
  severity?: BugSeverity;
  type?: string;
  projectId?: string;
  caseId?: string;
  caseLabel?: string;
  reportId?: string;
  /** Everyone on it, primary first (`[]` unassigns); wins over `assigneeId`. */
  assigneeIds?: string[];
  assigneeId?: string;
  /** Commit to a team cycle ('' leaves it; only the bug's own team's
   *  current/upcoming cycles are accepted server-side). */
  cycleId?: string;
  /** Start of the work window, ISO `YYYY-MM-DD` (empty string clears it). */
  startDate?: string;
  /** End / target date, ISO `YYYY-MM-DD` (empty string clears it). */
  endDate?: string;
  attachments?: BugAttachment[];
  /** Replace the bug's team-label keys ([] clears them). */
  labelKeys?: string[];
  /** Replace the bug's custom-field values, keyed by field id. */
  customFields?: Record<string, CustomFieldValue>;
}

// Bound to the bug cache namespace (`['bugs']`/`['bug']`) + `kind: bug`; all the
// fetch/optimistic logic lives in `makeIssueHooks` (see issues/hook-factory.ts).
const hooks = makeIssueHooks<BugDto, BugQuery, CreateBugInput, UpdateBugInput>({
  listKey: 'bugs',
  detailKey: 'bug',
  kind: IssueKind.BUG,
});

export const useBugs = hooks.useList;
export const useBug = hooks.useDetail;
export const useCreateBug = hooks.useCreate;
export const useUpdateBug = hooks.useUpdate;
/** Optimistic status move — the card jumps columns on drop, snaps back on failure
 * (see `makeIssueHooks`). */
export const useSetBugStatus = hooks.useSetStatus;
export const useDeleteBug = hooks.useRemove;

/** The stability chart's config — mirrors the backend `QueryBugStabilityDto`. */
export interface StabilityQuery {
  /** Scope to one team's bug list. Omitted on the workspace-wide `/bugs` route. */
  teamId?: string;
  projectId?: string;
  /** Period length; working days rather than calendar days when `skipWeekends`. */
  periodDays: number;
  /** How many periods to draw, newest last. Not a user control — see
   *  `STABILITY_PERIODS` in `StabilityView`. */
  periods: number;
  /** Which severities to count. Never empty: every number in the response (bars,
   *  backlog line, verdict) describes exactly this set. */
  severities: BugSeverity[];
  skipWeekends: boolean;
  /** The viewer's own today (`YYYY-MM-DD`), so the windows line up with the
   *  calendar they're looking at rather than the server's UTC one. */
  until: string;
}

/**
 * Bugs of the chosen severities opened per period, plus the still-open count
 * behind them — the QC stability read-out.
 *
 * Its own cache namespace (`bug-stability`), not `bugs`: this is an aggregate
 * over history, so it must survive a board write untouched rather than being
 * dropped by the list invalidation on every drag. `staleTime` is generous for
 * the same reason — the shape of eight weeks doesn't move in a minute.
 */
export function useBugStability(query: StabilityQuery, enabled = true) {
  return useQuery({
    queryKey: ['bug-stability', query],
    queryFn: () => apiGet<IssueStabilityDto>('/issues/stability', { ...query }),
    enabled,
    staleTime: 60_000,
  });
}
