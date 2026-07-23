import { UniqueEntityID } from '@core/domain';
import { CustomFieldValue } from '@application/teams/domain/enums/custom-field.enums';
import { BugAttachment, BugSeverity, IssueKind } from '../enums/issue.enums';

/**
 * The unified issue — the flat union of the old Task and Bug props with a `kind`
 * discriminator. Fields that apply to only one kind carry a neutral default on
 * the other (a bug's `estimate` is `0`, a task's `severity` is `''`), matching how
 * the migration backfilled the `issues` collection.
 */
export interface IssueProps {
  id: UniqueEntityID;
  /** `task` or `bug` — the one field that says which kind of issue this is. */
  kind: IssueKind;
  tenantId: string;
  /** The team whose issue list this belongs to. */
  teamId: string;
  /**
   * TASK-only. When set, a *private personal* task owned by this user id: it lives
   * on that user's Personal board (not in a team) and is visible only to the owner
   * and to admins. Empty ('') for a team task and for every bug. Team/assigned
   * views filter `ownerId: ''`, so personal tasks never leak into a team's lists.
   */
  ownerId: string;
  /** TASK-only. Parent issue id when this is a sub-task ('' otherwise). */
  parentId: string;
  /** Human-friendly per-tenant reference used in URLs, e.g. `TSK-7` / `BUG-12`.
   *  The internal UUID remains the real identity. */
  shortId: string;
  title: string;
  description: string;
  /** Column key: a built-in status (`TaskStatus`/`BugStatus`) or a custom slug. */
  status: string;

  // ── linkage ────────────────────────────────────────────────────────────────
  /** TASK-only. Optional link to the roadmap the backlog item belongs to. */
  roadmapId: string;
  /** TASK-only. The linked backlog item (roadmap item) this task delivers. */
  roadmapItemId: string;
  /** TASK-only. Denormalized label of the linked backlog item. */
  roadmapItemLabel: string;
  /** Optional link to a project. */
  projectId: string;
  /** The team cycle (auto-sprint) this issue is committed to; '' = none.
   *  Team-scoped like `teamId`; always '' on a personal task. */
  cycleId: string;
  /**
   * How many times the scheduler auto-carried this issue into the next cycle
   * because it was still unfinished when its cycle ended. `0` = created fresh in
   * its cycle (or manually placed — a manual cycle change resets this to 0).
   * Drives the "Carried over ×N" badge; stays 0 for a no-cycle issue.
   */
  carryOverCount: number;

  // ── people ───────────────────────────────────────────────────────────────
  assigneeId: string;
  assigneeName: string;
  /** Who opened the issue. For a bug this is its reporter (mirrored below). */
  createdBy: string;
  createdByName: string;
  /** BUG-only. The reporter (mirrors `createdBy` on a bug); '' for a task. */
  reporterId: string;
  reporterName: string;

  // ── dates / sizing ─────────────────────────────────────────────────────────
  /** Optional start date as an ISO `YYYY-MM-DD` string ('' when unset). */
  startDate: string;
  /** Optional end / target date as an ISO `YYYY-MM-DD` string ('' when unset).
   *  The deadline the board sorts and flags overdue on. */
  endDate: string;
  /** TASK-only @deprecated legacy mirror of {@link endDate}, kept in sync for old
   *  readers; '' for a bug. */
  dueDate: string;
  /** TASK-only. Points on the Fibonacci-ish scale (1,2,3,5,8,13,21); `0` = unset. */
  estimate: number;

  // ── bug specifics ─────────────────────────────────────────────────────────
  /** BUG-only. Severity (`''` for a task). */
  severity: BugSeverity | '';
  /** BUG-only. Free-text bug type/category. */
  type: string;
  /** BUG-only. Link to the test case (report section item) this bug came from. */
  caseId: string;
  /** BUG-only. Human-readable label of the linked case. */
  caseLabel: string;
  /** BUG-only. Link to the report/feature the linked case belongs to. */
  reportId: string;
  /** BUG-only. Files attached to the bug (screenshots, short screen-recordings). */
  attachments: BugAttachment[];

  // ── shared meta ────────────────────────────────────────────────────────────
  /** Keys of the team labels on this issue (a subset of its team's `labels`). */
  labelKeys: string[];
  /** Values for the team's custom fields, keyed by each field's stable `id`. */
  customFields: Record<string, CustomFieldValue>;
  /** Position within its status column. */
  order: number;
  createdAt: Date;
  updatedAt: Date;
}
