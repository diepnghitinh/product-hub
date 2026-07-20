import { UniqueEntityID } from '@core/domain';
import { BugAttachment, BugSeverity, BugStatus } from '../enums/bug.enums';

export interface BugProps {
  id: UniqueEntityID;
  tenantId: string;
  /** The team whose issue list this bug belongs to. */
  teamId: string;
  /** Human-friendly per-tenant reference used in URLs, e.g. `BUG-12`. The
   * internal UUID remains the real identity. */
  shortId: string;
  title: string;
  description: string;
  severity: BugSeverity;
  /** Column key: a built-in `BugStatus` or a custom column slug. */
  status: string;
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
  /** Files attached to the bug (screenshots, short screen-recordings). */
  attachments: BugAttachment[];
  createdAt: Date;
  updatedAt: Date;
}
