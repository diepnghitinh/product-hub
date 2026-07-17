import { UniqueEntityID } from '@core/domain';
import { TaskStatus } from '../enums/task.enums';

export interface TaskProps {
  id: UniqueEntityID;
  tenantId: string;
  /** The team whose issue list this task belongs to. */
  teamId: string;
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
  /** Optional due date as an ISO `YYYY-MM-DD` string ('' when unset). */
  dueDate: string;
  /** Position within its status group. */
  order: number;
  createdAt: Date;
  updatedAt: Date;
}
