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
  /** Optional link to the test case (report section item) this bug came from. */
  caseId: string;
  /** Human-readable label of the linked case (e.g. "TC-12 · Login"). */
  caseLabel: string;
  /** Optional link to the report/feature the linked case belongs to. */
  reportId: string;
  assigneeId: string;
  assigneeName: string;
  reporterId: string;
  reporterName: string;
  /** Position within its status column. */
  order: number;
  createdAt: Date;
  updatedAt: Date;
}
