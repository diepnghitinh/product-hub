import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { TaskStatus } from '@application/tasks/domain/enums/task.enums';
import { CustomFieldValue } from '@application/teams/domain/enums/custom-field.enums';

export interface TaskDoc {
  _id: string;
  tenantId: string;
  teamId: string;
  ownerId: string;
  parentId: string;
  shortId: string;
  title: string;
  description: string;
  /** Built-in `TaskStatus` or a custom column key. */
  status: string;
  roadmapId: string;
  roadmapItemId: string;
  roadmapItemLabel: string;
  projectId: string;
  assigneeId: string;
  assigneeName: string;
  createdBy: string;
  createdByName: string;
  startDate: string;
  endDate: string;
  dueDate: string;
  estimate: number;
  labelKeys: string[];
  customFields: Record<string, CustomFieldValue>;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export const TaskSchema = new Schema<TaskDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    // The team whose issue list this task is in.
    teamId: { type: String, default: '', index: true },
    // When set, a private personal task owned by this user (their Personal board),
    // not in a team. Team/assigned views filter `ownerId: ''`; the personal board
    // filters `ownerId: <me>` — so personal tasks never leak into team lists.
    ownerId: { type: String, default: '', index: true },
    // Parent task id when this is a sub-task ('' for a top-level task).
    parentId: { type: String, default: '', index: true },
    // Human-friendly reference used in URLs (e.g. TSK-7). Unique per tenant;
    // `sparse` so the pre-shortId rows the backfill hasn't reached don't clash.
    shortId: { type: String, default: '' },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, default: '' },
    // No enum: the status can be a built-in or a tenant's custom column key.
    status: { type: String, default: TaskStatus.TODO },
    roadmapId: { type: String, default: '', index: true },
    roadmapItemId: { type: String, default: '', index: true },
    roadmapItemLabel: { type: String, default: '' },
    projectId: { type: String, default: '', index: true },
    assigneeId: { type: String, default: '', index: true },
    assigneeName: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    createdByName: { type: String, default: '' },
    startDate: { type: String, default: '' },
    // Deadline the board sorts/flags on. `dueDate` is its legacy mirror, kept in
    // sync by the domain so pre-range rows and old readers keep working.
    endDate: { type: String, default: '' },
    dueDate: { type: String, default: '' },
    estimate: { type: Number, default: 0 },
    // Keys of the team labels on this task; resolved against its team's `labels`.
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
// sparse would still index them and the second '' would collide.
TaskSchema.index(
  { tenantId: 1, shortId: 1 },
  { unique: true, partialFilterExpression: { shortId: { $gt: '' } } },
);
