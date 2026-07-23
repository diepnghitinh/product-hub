import { makeIssueHooks } from './hook-factory';
import type { BugAttachment, IssueDto } from '@/types/dto';
import type { BugSeverity, CustomFieldValue, IssueKind } from '@/types/enums';

/**
 * Query for the unified issue list — a superset of the old task + bug filters
 * (mirrors the backend `QueryIssueDto`). Omitting `kind` returns both kinds;
 * `teamId` scopes to one team's list (a bug team returns bugs, a task team
 * returns tasks). Multi-value filters serialize as repeated keys
 * (`?status=a&status=b`), which is what the backend query parser expects.
 */
export interface IssueQuery {
  /** Restrict to `task` and/or `bug`; omit for both. */
  kind?: IssueKind[];
  /** Fetch specific issues by id — e.g. a closed cycle's frozen `unfinishedIds`,
   *  whose issues no longer point at that cycle. Never pass `[]` (that's "no
   *  filter", i.e. everything). */
  ids?: string[];
  /** Scope to one team's issue list. */
  teamId?: string;
  status?: string[];
  /** Bug severity filter (ignored for tasks). */
  severity?: BugSeverity[];
  assigneeId?: string[];
  /** Issues assigned to this user id (the "Assigned to me" views). */
  mine?: string;
  /** The caller's private personal board (owner from the token, never a param). */
  personal?: boolean;
  parentId?: string | string[];
  roadmapItemId?: string | string[];
  roadmapId?: string[];
  projectId?: string[];
  /** Team cycle: a cycle id, or `current` / `upcoming` / `none` — the sentinels
   *  resolve server-side against `teamId`, so saved links never go stale. */
  cycleId?: string;
  /** Bug → linked test case / report. */
  caseId?: string;
  reportId?: string;
  /** Free-text search over title / description / id / shortId. */
  search?: string;
}

/**
 * Create an issue. `kind` picks task vs bug; the kind-specific fields are simply
 * ignored for the other kind (a bug's `estimate`, a task's `severity`), so one
 * input type serves both — mirrors the backend `CreateIssueDto`.
 */
export interface CreateIssueInput {
  kind: IssueKind;
  title: string;
  description?: string;
  /** Built-in status or a team's custom column key. Defaults to the kind's first column. */
  status?: string;
  assigneeId?: string;
  /** Start of the work window, ISO `YYYY-MM-DD`. */
  startDate?: string;
  /** End / target date, ISO `YYYY-MM-DD`. */
  endDate?: string;
  /**
   * The team whose list to create in. Send it from a team's board — without it
   * the API files the issue under the workspace's default team for this kind,
   * not the one you were looking at.
   */
  teamId?: string;
  /** Create straight into a team cycle (a board filtered to a cycle creates
   *  there). A concrete current/upcoming cycle id of the issue's team. */
  cycleId?: string;
  projectId?: string;
  // ── task-only ──────────────────────────────────────────────────────────────
  /** @deprecated Legacy alias of `endDate`; prefer `endDate`. */
  dueDate?: string;
  /** Points on the estimate scale (see `TASK_ESTIMATES`); `0`/omitted = unset. */
  estimate?: number;
  /** Set to create this task as a sub-task of the given parent. */
  parentId?: string;
  roadmapId?: string;
  roadmapItemId?: string;
  roadmapItemLabel?: string;
  /** Create on the caller's *private personal board* (owned by them, in no team). */
  personal?: boolean;
  // ── bug-only ───────────────────────────────────────────────────────────────
  severity?: BugSeverity;
  type?: string;
  caseId?: string;
  caseLabel?: string;
  reportId?: string;
}

/** Patch an issue — every field optional; kind-specific fields no-op on the other kind. */
export interface UpdateIssueInput {
  title?: string;
  description?: string;
  projectId?: string;
  /** Commit to a team cycle — one of the issue's team's current/upcoming cycle
   *  ids ('' leaves the cycle; completed cycles are rejected server-side). */
  cycleId?: string;
  /** Empty string unassigns. */
  assigneeId?: string;
  startDate?: string;
  endDate?: string;
  /** Replace the issue's team-label keys ([] clears them). */
  labelKeys?: string[];
  /** Replace the issue's custom-field values, keyed by field id. */
  customFields?: Record<string, CustomFieldValue>;
  // ── task-only ──────────────────────────────────────────────────────────────
  /** @deprecated Legacy alias of `endDate`; prefer `endDate`. */
  dueDate?: string;
  estimate?: number;
  /** Set/clear the parent task (empty string detaches this sub-task). */
  parentId?: string;
  roadmapId?: string;
  roadmapItemId?: string;
  roadmapItemLabel?: string;
  // ── bug-only ───────────────────────────────────────────────────────────────
  severity?: BugSeverity;
  type?: string;
  caseId?: string;
  caseLabel?: string;
  reportId?: string;
  attachments?: BugAttachment[];
}

// The unified issue namespace: no `kind`, so lists span both kinds and cache under
// `['issues']`/`['issue']`. All logic lives in `makeIssueHooks` (see hook-factory.ts).
const hooks = makeIssueHooks<IssueDto, IssueQuery, CreateIssueInput, UpdateIssueInput>({
  listKey: 'issues',
  detailKey: 'issue',
});

/**
 * List issues across both kinds — the unified replacement for `useTasks` /
 * `useBugs`. Reads the authoritative `/issues` collection in one request; the
 * returned `ListResponse<IssueDto>` shape lets callers swap in place.
 */
export const useIssues = hooks.useList;
/** A single issue — drives the task/bug detail pages. */
export const useIssue = hooks.useDetail;
export const useCreateIssue = hooks.useCreate;
export const useUpdateIssue = hooks.useUpdate;
/** Optimistic status move — mirrors the old `useSetTaskStatus` / `useSetBugStatus`,
 * now over one collection (see `makeIssueHooks`). */
export const useSetIssueStatus = hooks.useSetStatus;
export const useDeleteIssue = hooks.useRemove;
