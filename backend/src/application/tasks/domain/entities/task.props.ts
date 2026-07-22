import { UniqueEntityID } from '@core/domain';
import { CustomFieldValue } from '@application/teams/domain/enums/custom-field.enums';
import { TaskStatus } from '../enums/task.enums';

export interface TaskProps {
  id: UniqueEntityID;
  tenantId: string;
  /** The team whose issue list this task belongs to. */
  teamId: string;
  /**
   * When set, this is a *private personal* task owned by this user id: it lives on
   * that user's Personal board (not in a team) and is visible only to the owner
   * and to admins. Empty ('') for a normal team task. Team/assigned views filter
   * `ownerId: ''`, so personal tasks never leak into a team's lists.
   */
  ownerId: string;
  /** Parent task id when this is a sub-task ('' for a top-level task). */
  parentId: string;
  /** Human-friendly per-tenant reference used in URLs, e.g. `TSK-7`. The
   * internal UUID remains the real identity. */
  shortId: string;
  title: string;
  description: string;
  /** Column key: a built-in `TaskStatus` or a custom column slug. */
  status: string;
  /** Optional link to the roadmap the backlog item belongs to. */
  roadmapId: string;
  /** The linked backlog item (roadmap item) this task delivers. */
  roadmapItemId: string;
  /** Denormalized label of the linked backlog item, e.g. "Now · Passkey login". */
  roadmapItemLabel: string;
  /** Optional link to a project (from the roadmap/item). */
  projectId: string;
  assigneeId: string;
  assigneeName: string;
  createdBy: string;
  createdByName: string;
  /** Optional start date as an ISO `YYYY-MM-DD` string ('' when unset). */
  startDate: string;
  /** Optional end / target date as an ISO `YYYY-MM-DD` string ('' when unset).
   *  This is the deadline the board sorts and flags overdue on. */
  endDate: string;
  /** @deprecated Superseded by {@link endDate}, which it mirrors for back-compat
   *  (old clients/readers still read `dueDate`). Kept in sync, never dropped. */
  dueDate: string;
  /** Points on the Fibonacci-ish scale (1,2,3,5,8,13,21); `0` means unset. */
  estimate: number;
  /** Keys of the team labels on this task (a subset of its team's `labels`). */
  labelKeys: string[];
  /** Values for the team's custom fields, keyed by each field's stable `id`. */
  customFields: Record<string, CustomFieldValue>;
  /** Position within its status group. */
  order: number;
  createdAt: Date;
  updatedAt: Date;
}
