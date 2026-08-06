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
  /** Everyone on the issue, primary first. Absent on a pre-multi-assign row —
   *  `assigneeId` is that row's single assignee, which is why both are queried. */
  assignees: { id: string; name: string }[];
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
  /** When it entered a done status and stayed there; null while open. */
  resolvedAt: Date | null;
  // ── CI/CD ──────────────────────────────────────────────────────────────────
  // The *latest* pipeline that named this issue, denormalized onto the issue so
  // the label costs no extra read. Only ever written by an inbound webhook; an
  // issue nobody has built carries '' and renders no label at all.
  /** A `PipelineState` value, or '' when no pipeline has reported. */
  ciStatus: string;
  /** Link out to the run on GitHub / GitLab. */
  ciUrl: string;
  /** `github` | `gitlab` — which host reported it. */
  ciProvider: string;
  /** Branch the run was on, shown next to the label so a stale one is obvious. */
  ciBranch: string;
  ciUpdatedAt: Date | null;
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
    // Everyone on the issue, primary first. `_id: false` — these are denormalized
    // name/id pairs, not documents of their own (same shape a roadmap item uses).
    assignees: {
      type: [new Schema({ id: String, name: String }, { _id: false })],
      default: [],
    },
    // Primary assignee, mirrored from `assignees[0]` by the entity. Still indexed:
    // it's what a pre-multi-assign row has, and what the "assigned to me" and
    // per-assignee filters `$or` against `assignees.id`.
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
    // When this issue became finished — set/cleared by the entity as it crosses
    // the done boundary (never by a client). Indexed: it's what the boards'
    // "Solved date" filter ranges over. Absent on a pre-`resolvedAt` row reads
    // as null; `backfill:issue-resolved-at` stamps those from their updatedAt.
    resolvedAt: { type: Date, default: null, index: true },
    // Latest CI/CD run for this issue — see the interface above. Not indexed:
    // nothing queries by build state, the label is only ever read alongside the
    // issue it belongs to.
    ciStatus: { type: String, default: '' },
    ciUrl: { type: String, default: '' },
    ciProvider: { type: String, default: '' },
    ciBranch: { type: String, default: '' },
    ciUpdatedAt: { type: Date, default: null },
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

// Co-assignee lookups ("everything Nguyen is on", My Team, the assignee filter).
// A multikey index on the array path — the primary is covered by `assigneeId`
// above, and an assignee filter hits both halves of its `$or`.
IssueSchema.index({ tenantId: 1, 'assignees.id': 1 });
