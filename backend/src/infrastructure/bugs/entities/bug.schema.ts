import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { BugAttachment, BugSeverity, BugStatus } from '@application/bugs/domain/enums/bug.enums';
import { CustomFieldValue } from '@application/teams/domain/enums/custom-field.enums';

export interface BugDoc {
  _id: string;
  tenantId: string;
  teamId: string;
  shortId: string;
  title: string;
  description: string;
  severity: BugSeverity;
  /** Built-in `BugStatus` or a custom column key. */
  status: string;
  type: string;
  projectId: string;
  caseId: string;
  caseLabel: string;
  reportId: string;
  assigneeId: string;
  assigneeName: string;
  reporterId: string;
  reporterName: string;
  startDate: string;
  endDate: string;
  order: number;
  attachments: BugAttachment[];
  labelKeys: string[];
  customFields: Record<string, CustomFieldValue>;
  createdAt: Date;
  updatedAt: Date;
}

export const BugSchema = new Schema<BugDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    // The team whose issue list this bug is in.
    teamId: { type: String, default: '', index: true },
    // Human-friendly reference used in URLs (e.g. BUG-12). Unique per tenant;
    // `sparse` so the pre-shortId rows the backfill hasn't reached don't clash.
    shortId: { type: String, default: '' },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, default: '' },
    severity: { type: String, enum: Object.values(BugSeverity), default: BugSeverity.MEDIUM },
    // No enum: the status can be a built-in or a tenant's custom column key.
    status: { type: String, default: BugStatus.OPEN },
    type: { type: String, default: '' },
    projectId: { type: String, default: '', index: true },
    caseId: { type: String, default: '', index: true },
    caseLabel: { type: String, default: '' },
    reportId: { type: String, default: '', index: true },
    assigneeId: { type: String, default: '', index: true },
    assigneeName: { type: String, default: '' },
    reporterId: { type: String, default: '' },
    reporterName: { type: String, default: '' },
    startDate: { type: String, default: '' },
    endDate: { type: String, default: '' },
    order: { type: Number, default: 0 },
    attachments: { type: [Schema.Types.Mixed], default: [] } as unknown as BugAttachment[],
    // Keys of the team labels on this bug; resolved against its team's `labels`.
    labelKeys: { type: [String], default: [] },
    // Custom-field values keyed by the team field id; free-form so any field
    // type's value round-trips. Empty by default.
    customFields: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// Lookups + uniqueness for the URL-facing short id. `partialFilterExpression`
// (not `sparse`) because unset rows default to '' rather than being absent —
// sparse would still index them and the second '' would collide.
BugSchema.index(
  { tenantId: 1, shortId: 1 },
  { unique: true, partialFilterExpression: { shortId: { $gt: '' } } },
);
