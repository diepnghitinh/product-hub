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

/** The shipped default board columns (array order = display order). */
export const DEFAULT_BUG_STATUSES: BugStatusConfig[] = BUG_STATUSES.map((key) => ({
  key,
  label: DEFAULT_BUG_STATUS_LABEL[key],
  color: DEFAULT_BUG_STATUS_COLOR[key],
}));
