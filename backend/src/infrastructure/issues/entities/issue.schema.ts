import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { BugAttachment, BugSeverity, IssueKind, TaskStatus } from '@application/issues/domain/enums/issue.enums';
import { CustomFieldValue } from '@application/teams/domain/enums/custom-field.enums';

/**
 * The unified `issues` collection — one document per task or bug, told apart by
 * `kind`. It is the flat union of the old `tasks`/`bugs` shapes (see the
 * migrate-issues script that backfilled it), so an id/shortId is preserved from
 * its source row and existing IssueLink refs stay valid.
 */
export interface IssueDoc {
  _id: string;
  kind: IssueKind;
  tenantId: string;
  teamId: string;
  ownerId: string;
  parentId: string;
  shortId: string;
  title: string;
  description: string;
  /** Built-in status or a custom column key. */
  status: string;
  roadmapId: string;
  roadmapItemId: string;
  roadmapItemLabel: string;
  projectId: string;
  cycleId: string;
  carryOverCount: number;
  assigneeId: string;
  assigneeName: string;
  createdBy: string;
  createdByName: string;
  reporterId: string;
  reporterName: string;
  startDate: string;
  endDate: string;
  dueDate: string;
  estimate: number;
  severity: BugSeverity | '';
  type: string;
  caseId: string;
  caseLabel: string;
  reportId: string;
  attachments: BugAttachment[];
  labelKeys: string[];
  customFields: Record<string, CustomFieldValue>;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export const IssueSchema = new Schema<IssueDoc>(
  {
    _id: { type: String, default: () => uuid() },
    // task | bug — the discriminator every kind-aware read filters on.
    kind: { type: String, enum: Object.values(IssueKind), required: true, index: true },
    tenantId: { type: String, required: true, index: true },
    // The team whose issue list this is in.
    teamId: { type: String, default: '', index: true },
    // TASK-only: a private personal task owned by this user (their Personal board),
    // not in a team. Team/assigned views filter `ownerId: ''`; the personal board
    // filters `ownerId: <me>` — so personal tasks never leak into team lists. '' for bugs.
    ownerId: { type: String, default: '', index: true },
    // TASK-only: parent issue id when this is a sub-task ('' otherwise).
    parentId: { type: String, default: '', index: true },
    // Human-friendly reference used in URLs (TSK-7 / BUG-12). Unique per tenant via
    // the partial index below; '' until the backfill reaches a pre-shortId row.
    shortId: { type: String, default: '' },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, default: '' },
    // No enum: a built-in status or a tenant's custom column key.
    status: { type: String, default: TaskStatus.TODO },
    roadmapId: { type: String, default: '', index: true },
    roadmapItemId: { type: String, default: '', index: true },
    roadmapItemLabel: { type: String, default: '' },
    projectId: { type: String, default: '', index: true },
    // The team cycle (auto-sprint) this issue is committed to; '' = none. An
    // absent field on a pre-cycles row reads as '' — no migration needed.
    cycleId: { type: String, default: '', index: true },
    // Times auto-rollover carried this issue forward (unfinished at a cycle
    // boundary). Absent on a pre-cycles row reads as 0 — no migration needed.
    carryOverCount: { type: Number, default: 0 },
    assigneeId: { type: String, default: '', index: true },
    assigneeName: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    createdByName: { type: String, default: '' },
    // BUG-only reporter (mirrors createdBy on a bug); '' for a task.
    reporterId: { type: String, default: '' },
    reporterName: { type: String, default: '' },
    startDate: { type: String, default: '' },
    // Deadline the board sorts/flags on. `dueDate` is the task-only legacy mirror.
    endDate: { type: String, default: '' },
    dueDate: { type: String, default: '' },
    estimate: { type: Number, default: 0 },
    // No enum: a task carries '' here, a bug a BugSeverity value.
    severity: { type: String, default: '' },
    type: { type: String, default: '' },
    caseId: { type: String, default: '', index: true },
    caseLabel: { type: String, default: '' },
    reportId: { type: String, default: '', index: true },
    attachments: { type: [Schema.Types.Mixed], default: [] } as unknown as BugAttachment[],
    // Keys of the team labels on this issue; resolved against its team's `labels`.
    labelKeys: { type: [String], default: [] },
    // Custom-field values keyed by the team field id; free-form so any field
    // type's value (string/number/bool/date-string) round-trips. Empty by default.
    customFields: { type: Schema.Types.Mixed, default: {} },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Lookups + uniqueness for the URL-facing short id. `partialFilterExpression`
// (not `sparse`) because unset rows default to '' rather than being absent —
// sparse would still index them and the second '' would collide. Task and bug
// shortIds never collide (TSK-* vs BUG-*), so this holds across the merged set.
IssueSchema.index(
  { tenantId: 1, shortId: 1 },
  { unique: true, partialFilterExpression: { shortId: { $gt: '' } } },
);
