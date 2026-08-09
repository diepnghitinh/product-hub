import { IssueStatusCategory } from '@application/issues/domain/enums/status-category.enums';

/** Bug severity (docs/00-feature-inventory.md §4). */
export enum BugSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export const BUG_SEVERITIES: BugSeverity[] = [
  BugSeverity.LOW,
  BugSeverity.MEDIUM,
  BugSeverity.HIGH,
  BugSeverity.CRITICAL,
];

/**
 * Default bug workflow statuses. In product-os these are admin-configurable on
 * app-settings; product-hub ships this fixed set for now (Phase 5 makes them
 * configurable). These double as the Kanban board columns, in this order.
 */
export enum BugStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in-progress',
  BLOCKED = 'blocked',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export const BUG_STATUSES: BugStatus[] = [
  BugStatus.OPEN,
  BugStatus.IN_PROGRESS,
  BugStatus.BLOCKED,
  BugStatus.RESOLVED,
  BugStatus.CLOSED,
];

/**
 * Tenant-configurable board column for bugs. `key` is the stable value stored on
 * each bug: the built-ins (`BugStatus`) can be relabelled/recoloured/reordered
 * but not removed, and admins may add **custom** columns with their own slug
 * `key`. Typed as `string` (not `BugStatus`) to allow those custom keys; the
 * built-in keys are the `BugStatus` members.
 */
export interface BugStatusConfig {
  key: string;
  label: string;
  color: string;
  /** What this column *means* — see {@link IssueStatusCategory}. Optional on the
   *  way in: a column stored before categories existed resolves through
   *  {@link BUILTIN_BUG_STATUS_CATEGORY} on read. */
  category?: IssueStatusCategory;
  /** Optional one-liner shown under the label ("Ready for QC to test"). */
  description?: string;
}

/** A file attached to a bug (image / short video), stored in the tenant's
 * configured cloud storage. Shape matches the upload endpoint's response. */
export interface BugAttachment {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

export const DEFAULT_BUG_STATUS_LABEL: Record<BugStatus, string> = {
  [BugStatus.OPEN]: 'Open',
  [BugStatus.IN_PROGRESS]: 'In progress',
  [BugStatus.BLOCKED]: 'Blocked',
  [BugStatus.RESOLVED]: 'Resolved',
  [BugStatus.CLOSED]: 'Closed',
};

export const DEFAULT_BUG_STATUS_COLOR: Record<BugStatus, string> = {
  [BugStatus.OPEN]: '#6b7280',
  [BugStatus.IN_PROGRESS]: '#2563eb',
  [BugStatus.BLOCKED]: '#dc2626',
  [BugStatus.RESOLVED]: '#16a34a',
  [BugStatus.CLOSED]: '#4b5563',
};

/**
 * What each shipped column means. `resolved` and `closed` are the two that have
 * always counted as finished, so mapping them to COMPLETED is what keeps every
 * existing board reading exactly as it did. `blocked` is STARTED, not a category
 * of its own: stuck work is still work in flight.
 */
export const BUILTIN_BUG_STATUS_CATEGORY: Record<BugStatus, IssueStatusCategory> = {
  [BugStatus.OPEN]: IssueStatusCategory.UNSTARTED,
  [BugStatus.IN_PROGRESS]: IssueStatusCategory.STARTED,
  [BugStatus.BLOCKED]: IssueStatusCategory.STARTED,
  [BugStatus.RESOLVED]: IssueStatusCategory.COMPLETED,
  [BugStatus.CLOSED]: IssueStatusCategory.COMPLETED,
};

/** The shipped default board columns (array order = display order). */
export const DEFAULT_BUG_STATUSES: BugStatusConfig[] = BUG_STATUSES.map((key) => ({
  key,
  label: DEFAULT_BUG_STATUS_LABEL[key],
  color: DEFAULT_BUG_STATUS_COLOR[key],
  category: BUILTIN_BUG_STATUS_CATEGORY[key],
  description: '',
}));
