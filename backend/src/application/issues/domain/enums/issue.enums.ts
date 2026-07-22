/**
 * Enums for the unified **Issue** — the one concept that replaces the separate
 * Task and Bug. An issue's `kind` says which it is; the rest of the vocabulary
 * (statuses, severity, estimate scale) is shared with, and re-exported from, the
 * original task/bug enum homes so there is a single source of truth during the
 * migration.
 *
 * NOTE (cleanup): when the old `tasks`/`bugs` modules are retired, move those enum
 * *definitions* into this file and repoint the few external importers (teams,
 * roadmaps, activity, backfills). Re-exporting keeps them from drifting until then.
 */
export enum IssueKind {
  TASK = 'task',
  BUG = 'bug',
}

export const ISSUE_KINDS: IssueKind[] = [IssueKind.TASK, IssueKind.BUG];

// Shared status/severity vocabulary — re-exported, not redefined (see note above).
export {
  TaskStatus,
  TASK_STATUSES,
  TASK_ESTIMATE_VALUES,
} from '@application/tasks/domain/enums/task.enums';
export {
  BugStatus,
  BUG_STATUSES,
  BugSeverity,
  BUG_SEVERITIES,
} from '@application/bugs/domain/enums/bug.enums';

export type { TaskStatusConfig } from '@application/tasks/domain/enums/task.enums';
export type { BugStatusConfig, BugAttachment } from '@application/bugs/domain/enums/bug.enums';
