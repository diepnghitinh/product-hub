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

import { TaskStatus as TaskStatusEnum } from '@application/tasks/domain/enums/task.enums';
import { BugStatus as BugStatusEnum } from '@application/bugs/domain/enums/bug.enums';

/**
 * The **fallback** answer to "is this issue done?", per kind: the shipped keys,
 * read literally.
 *
 * The real answer lives on the board's own columns — a status whose category is
 * `completed` means done, whatever it is called (`TeamEntity.completedStatusKeys`
 * / `UserEntity.completedStatusKeys`). This list is what's used when those
 * columns aren't at hand: an issue whose team can't be loaded, and the shipped
 * defaults themselves, which map to exactly these keys. So the fallback never
 * *contradicts* a board — at worst it knows less about one.
 */
export const COMPLETED_STATUS_KEYS: Record<IssueKind, string[]> = {
  [IssueKind.BUG]: [BugStatusEnum.RESOLVED, BugStatusEnum.CLOSED],
  [IssueKind.TASK]: [TaskStatusEnum.DONE],
};

/**
 * Whether `status` means "finished".
 *
 * Pass `completedKeys` — the board's own completed columns — whenever the caller
 * has them; a team that added a "Released" column is only understood through
 * those. Without them this falls back to the shipped keys for the kind.
 */
export function isCompletedStatus(
  kind: IssueKind,
  status: string,
  completedKeys?: readonly string[],
): boolean {
  return (completedKeys ?? COMPLETED_STATUS_KEYS[kind]).includes(status);
}
