/**
 * ClickUp integration — link a ClickUp task to an issue or a backlog item and
 * keep its state beside it.
 *
 * The important difference from the git integrations next door: this one is
 * **outbound as well as inbound**. Reading a task and registering a webhook both
 * require calling ClickUp with a credential, so unlike GitHub/GitLab we do store
 * a token. That token is the whole of this feature's blast radius, so it is:
 * written once, never serialized back to any client (the API answers with a
 * `tokenPreview` instead), and used for exactly the three calls in
 * `ClickUpClient`.
 *
 * The sync is **one-way, mirror-only**: ClickUp tells us its task changed, we
 * re-read it and store a snapshot. Nothing here ever writes to ClickUp, and a
 * ClickUp status never moves a product-os issue — this workspace stays the
 * author of its own board.
 */

/** ClickUp's own status buckets. `done`/`closed` are the two finished ones. */
export enum ClickUpStatusType {
  OPEN = 'open',
  CUSTOM = 'custom',
  DONE = 'done',
  CLOSED = 'closed',
}

/** What a ClickUp task can be linked to on our side. */
export enum ClickUpLinkTarget {
  /** A task or a bug — both live in the unified `issues` collection. */
  ISSUE = 'issue',
  /** A backlog item, embedded in its roadmap (hence `roadmapId` on the link). */
  ROADMAP_ITEM = 'roadmap_item',
}

export const CLICKUP_LINK_TARGETS: ClickUpLinkTarget[] = [
  ClickUpLinkTarget.ISSUE,
  ClickUpLinkTarget.ROADMAP_ITEM,
];

/**
 * The ClickUp events we ask to be notified about.
 *
 * We subscribe narrowly but react uniformly: whichever of these arrives, the
 * handler just re-reads the task and re-snapshots it. Parsing ClickUp's
 * `history_items` to apply a delta would be more code and less correct — a
 * missed or reordered delivery would leave a snapshot permanently wrong,
 * whereas a re-read is idempotent and self-healing.
 */
export const CLICKUP_WEBHOOK_EVENTS = [
  'taskUpdated',
  'taskStatusUpdated',
  'taskAssigneeUpdated',
  'taskDueDateUpdated',
  'taskPriorityUpdated',
  'taskMoved',
  'taskDeleted',
] as const;

/** One connected ClickUp workspace. At most one per tenant. */
export interface ClickUpConfig {
  /** Personal API token (`pk_…`). Persisted; NEVER returned to a client. */
  apiToken: string;
  /** ClickUp calls a workspace a "team" in its API. This is that id. */
  workspaceId: string;
  /** Display name, so Settings can say which workspace without a round trip. */
  workspaceName: string;
  /** The webhook we registered in ClickUp — kept so disconnect can delete it
   *  rather than leaving a dead endpoint firing at us forever. '' if
   *  registration failed and the admin is running on manual refresh only. */
  webhookId: string;
  /** Minted by ClickUp when the webhook is created; it signs every delivery
   *  (`X-Signature`). Not chosen by us and not rotatable independently — a
   *  rotate means deleting and re-creating the webhook. */
  webhookSecret: string;
  /**
   * The unguessable path segment in the URL ClickUp posts to. This is what
   * resolves the tenant on an inbound delivery, which has no session — the same
   * job `GitIntegrationConfig.token` does, and minted the same way.
   */
  urlToken: string;
  enabled: boolean;
  connectedAt: string;
  /** '' until the first delivery lands — the "did I wire this up right?" signal. */
  lastEventAt: string;
  /** One line about it, e.g. `Fix login · in progress · 2 links updated`. */
  lastEventSummary: string;
}

/** A fresh connection's non-user fields. */
export function newClickUpDefaults(): Pick<
  ClickUpConfig,
  'enabled' | 'connectedAt' | 'lastEventAt' | 'lastEventSummary'
> {
  return {
    enabled: true,
    connectedAt: new Date().toISOString(),
    lastEventAt: '',
    lastEventSummary: '',
  };
}

/**
 * Last four characters of the stored token, for a settings screen that has to
 * show *something* without showing the credential. Never the first characters:
 * ClickUp tokens all start `pk_` followed by the account id, so a prefix would
 * be both useless for telling two tokens apart and a small leak.
 */
export function tokenPreview(token: string): string {
  return token ? `…${token.slice(-4)}` : '';
}
