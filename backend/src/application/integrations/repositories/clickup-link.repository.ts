import {
  ClickUpLinkOrigin,
  ClickUpLinkTarget,
  ClickUpStatusType,
} from '@application/app-settings/domain/clickup.types';

/**
 * The mirrored half of a link — everything we copied from ClickUp so the panel
 * renders without calling out on every page load. Stale by design between
 * deliveries; `lastSyncedAt` is how the UI says so.
 */
export interface ClickUpTaskSnapshot {
  taskName: string;
  taskUrl: string;
  /** The workspace's readable id (`DEV-123`), when it has that feature on. */
  customId: string;
  status: string;
  statusColor: string;
  statusType: ClickUpStatusType;
  assignees: string[];
  priority: string;
  /** ISO `YYYY-MM-DD`, or ''. */
  dueDate: string;
  listName: string;
  spaceName: string;
  /**
   * '' when healthy. Set when ClickUp says the task is gone or we lost access —
   * the row stays so the user can see *what* was linked and unlink deliberately,
   * rather than a link quietly vanishing and looking like someone removed it.
   */
  unavailableReason: string;
}

/** One ClickUp task linked to one product-os record. */
export interface ClickUpLinkRecord extends ClickUpTaskSnapshot {
  id: string;
  tenantId: string;
  /** ClickUp's task id — the reverse-lookup key when a delivery names a task. */
  clickupTaskId: string;
  targetType: ClickUpLinkTarget;
  /** The issue id, or the roadmap *item* id. */
  targetId: string;
  /** Which roadmap owns that item — items are embedded, so the item id alone
   *  doesn't locate one. '' for an issue. */
  roadmapId: string;
  /**
   * Pasted by hand, or created by a bound board. The permission flag for every
   * write path: only {@link ClickUpLinkOrigin.SYNC} links are ever written to or
   * allowed to move a card here. A row written before this existed reads back as
   * `manual`, which is what it was.
   */
  origin: ClickUpLinkOrigin;
  /**
   * The ClickUp status name **we** last sent, on a synced link.
   *
   * The echo guard. Pushing a status makes ClickUp fire `taskStatusUpdated`
   * straight back at us; without this, that delivery reads as "someone moved the
   * card in ClickUp" and re-applies our own change as if it were theirs. Storing
   * what we sent lets the handler recognise its own echo and ignore it — no
   * timers, no clock skew, no debounce window to tune.
   */
  pushedStatus: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  lastSyncedAt: Date;
}

export interface CreateClickUpLinkData extends ClickUpTaskSnapshot {
  tenantId: string;
  clickupTaskId: string;
  targetType: ClickUpLinkTarget;
  targetId: string;
  roadmapId: string;
  /** Defaults to `manual` — the pasted-URL path doesn't have to say so. */
  origin?: ClickUpLinkOrigin;
  createdBy: string;
  createdByName: string;
}

/**
 * Port for ClickUp link persistence. All reads are tenant-scoped.
 *
 * A collection of its own rather than fields on the issue, for three reasons
 * that all point the same way: the inbound webhook needs an indexed reverse
 * lookup by ClickUp task id; a backlog item is *embedded* in its roadmap, so
 * storing the mirror there would mean loading and re-saving a whole roadmap
 * aggregate on every ClickUp status change; and one ClickUp task can legitimately
 * back more than one piece of work here.
 */
export abstract class IClickUpLinkRepository {
  /** Every link on one record, oldest first. */
  findForTarget: (
    tenantId: string,
    targetType: ClickUpLinkTarget,
    targetId: string,
  ) => Promise<ClickUpLinkRecord[]>;
  /** Links across several records at once — for a list that renders many rows. */
  findForTargets: (
    tenantId: string,
    targetType: ClickUpLinkTarget,
    targetIds: string[],
  ) => Promise<ClickUpLinkRecord[]>;
  /** Every link pointing at one ClickUp task — what an inbound delivery updates. */
  findByTaskId: (tenantId: string, clickupTaskId: string) => Promise<ClickUpLinkRecord[]>;
  findById: (tenantId: string, id: string) => Promise<ClickUpLinkRecord | null>;
  /** Idempotent: re-linking the same task to the same record refreshes it. */
  create: (data: CreateClickUpLinkData) => Promise<ClickUpLinkRecord>;
  /** Re-stamp the mirrored fields on every link to one task. Returns the count. */
  updateSnapshot: (
    tenantId: string,
    clickupTaskId: string,
    snapshot: ClickUpTaskSnapshot,
  ) => Promise<number>;
  /** Record the status we just sent to ClickUp — see {@link ClickUpLinkRecord.pushedStatus}. */
  markPushed: (tenantId: string, id: string, pushedStatus: string) => Promise<void>;
  removeById: (tenantId: string, id: string) => Promise<boolean>;
  /** Drop every link in a workspace — used when ClickUp is disconnected for good. */
  removeAllForTenant: (tenantId: string) => Promise<number>;
}
