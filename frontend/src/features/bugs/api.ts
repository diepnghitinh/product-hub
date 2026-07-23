import { makeIssueHooks } from '@/features/issues/hook-factory';
import { IssueKind } from '@/types/enums';
import type { BugAttachment, BugDto } from '@/types/dto';
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
  projectId?: string[];
  /** Team cycle: a cycle id, or `current` / `upcoming` / `none` — the sentinels
   *  resolve server-side against `teamId`, so saved links never go stale. */
  cycleId?: string;
  caseId?: string;
  reportId?: string;
  search?: string;
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
