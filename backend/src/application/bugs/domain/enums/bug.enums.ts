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
