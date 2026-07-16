import { UniqueEntityID } from '@core/domain';
import { TaskStatus } from '../enums/task.enums';

export interface TaskProps {
  id: UniqueEntityID;
  tenantId: string;
  title: string;
  description: string;
  status: TaskStatus;
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
