import { UniqueEntityID } from '@core/domain';
import { BugSeverity, BugStatus } from '../enums/bug.enums';

export interface BugProps {
  id: UniqueEntityID;
  tenantId: string;
  title: string;
  description: string;
  severity: BugSeverity;
  status: BugStatus;
  type: string;
  /** Optional link to a project. */
  projectId: string;
  assigneeId: string;
  assigneeName: string;
  reporterId: string;
  reporterName: string;
  /** Position within its status column. */
  order: number;
  createdAt: Date;
  updatedAt: Date;
}
