import { ClickUpSyncScope } from '@application/app-settings/domain/clickup.types';
import { ClickUpStatusPair } from '../domain/clickup-status-map';

/** One of our boards bound to one ClickUp list. */
export interface ClickUpSyncBinding {
  id: string;
  tenantId: string;
  scope: ClickUpSyncScope;
  /** The team id, or the roadmap id. */
  scopeId: string;
  /** ClickUp's list id — the destination new tasks are created in. */
  listId: string;
  /** Display names, so the settings screen names the destination offline. */
  listName: string;
  spaceId: string;
  spaceName: string;
  /**
   * Off pauses the whole binding without losing the map: nothing is pushed and
   * nothing inbound moves a card. Kept rather than deleted so a team can stop
   * syncing for a sprint and resume without redoing the mapping.
   */
  enabled: boolean;
  /**
   * Our columns → ClickUp's statuses. Stored explicitly (see
   * `clickup-status-map.ts`) and read through `reconcileMap`, because the board's
   * columns can change after this was saved.
   */
  statusMap: ClickUpStatusPair[];
  createdAt: Date;
  updatedAt: Date;
}

/** Everything a caller supplies when binding a board; the rest is server-owned. */
export interface SaveClickUpSyncData {
  tenantId: string;
  scope: ClickUpSyncScope;
  scopeId: string;
  listId: string;
  listName: string;
  spaceId: string;
  spaceName: string;
  enabled: boolean;
  statusMap: ClickUpStatusPair[];
}

/**
 * Port for the board↔list bindings. All reads are tenant-scoped.
 *
 * Its own collection rather than a field on the team and another on the roadmap,
 * for the reason the links next door have one: this is *ClickUp's* view of our
 * boards, it has the same shape for both kinds of board, and neither aggregate
 * should grow a vendor's vocabulary. It also means disconnecting ClickUp is one
 * `removeAllForTenant` rather than a sweep through two collections.
 */
export abstract class IClickUpSyncRepository {
  /** The binding for one board, or null when it isn't bound. */
  findForScope: (
    tenantId: string,
    scope: ClickUpSyncScope,
    scopeId: string,
  ) => Promise<ClickUpSyncBinding | null>;
  /** Every binding in a workspace — the settings overview and the disconnect sweep. */
  findAllForTenant: (tenantId: string) => Promise<ClickUpSyncBinding[]>;
  /** Create or replace the binding for one board (upsert on scope + scopeId). */
  save: (data: SaveClickUpSyncData) => Promise<ClickUpSyncBinding>;
  /** Unbind one board. Existing ClickUp tasks are left alone — see the use-case. */
  removeForScope: (tenantId: string, scope: ClickUpSyncScope, scopeId: string) => Promise<boolean>;
  /** Drop every binding in a workspace — used when ClickUp is disconnected. */
  removeAllForTenant: (tenantId: string) => Promise<number>;
}
