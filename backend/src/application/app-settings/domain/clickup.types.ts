/**
 * ClickUp integration — mirror a ClickUp task beside a record, or bind a whole
 * board to a ClickUp list and keep the two in step.
 *
 * The important difference from the git integrations next door: this one is
 * **outbound as well as inbound**. Reading a task and registering a webhook both
 * require calling ClickUp with a credential, so unlike GitHub/GitLab we do store
 * a token. That token is the whole of this feature's blast radius, so it is:
 * written once, never serialized back to any client (the API answers with a
 * `tokenPreview` instead), and used only from `ClickUpClient`.
 *
 * There are two distinct ways a ClickUp task and a product-os record end up
 * side by side, and they carry **different promises**:
 *
 * - **A pasted link** ({@link ClickUpLinkOrigin.MANUAL}) — someone dropped a
 *   ClickUp URL onto an issue. Mirror-only, exactly as it always was: we read
 *   that task and render it beside the record, and we never write to it. It
 *   belongs to whoever made it, in a list we know nothing about.
 * - **A bound board** ({@link ClickUpLinkOrigin.SYNC}) — a team (or a roadmap)
 *   is bound to a ClickUp list, so every issue on it *has* a ClickUp task that
 *   this workspace created and owns. Those we write to.
 *
 * The direction rule for a bound board, decided by the product owner:
 * **every field pushes out; only status also comes back in.** Titles, dates,
 * priority and people are authored here and mirrored there, so nobody can rename
 * your backlog from ClickUp. Status is the one thing both boards genuinely share
 * — a developer who drags the card in ClickUp has moved the work — so it travels
 * both ways, through the explicit map on the binding and never by guesswork.
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
 * How a link came to exist — and therefore what we're allowed to do with it.
 *
 * This is the single flag that keeps the old promise intact while the new
 * feature writes to ClickUp. Every write path checks it, so a task somebody
 * pasted in cannot be renamed, re-statused or re-dated by us; only tasks this
 * workspace created for a bound board are ever written to.
 */
export enum ClickUpLinkOrigin {
  /** A ClickUp URL pasted onto a record. Read-only, forever. */
  MANUAL = 'manual',
  /** Created by us in a bound list, and kept in step from both sides. */
  SYNC = 'sync',
}

/** Which of our boards a ClickUp list can be bound to. */
export enum ClickUpSyncScope {
  /** A team's issue board — its `TeamStatusConfig[]` are the columns mapped. */
  TEAM = 'team',
  /** A roadmap's backlog — its `RoadmapColumn[]` are the columns mapped. */
  ROADMAP = 'roadmap',
}

export const CLICKUP_SYNC_SCOPES: ClickUpSyncScope[] = [
  ClickUpSyncScope.TEAM,
  ClickUpSyncScope.ROADMAP,
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

/**
 * One of our people pinned to one ClickUp member.
 *
 * Assignees travel to ClickUp as numeric member ids, and the two systems share
 * no identifier — so the push matches on **email**, which works right up until
 * someone's ClickUp seat uses a different address. This is the override for
 * that, and only that: a row here exists because the automatic match was wrong
 * or absent, so an empty map is the normal state of a healthy workspace rather
 * than something waiting to be filled in.
 *
 * `username`/`email` are cached from ClickUp so Settings can render the pairing
 * without a round trip; the id is the only field that decides anything.
 */
export interface ClickUpUserLink {
  /** Our `User.id`. */
  userId: string;
  /** ClickUp's numeric member id — what actually goes on the task. */
  memberId: number;
  /** ClickUp's display name at the time it was mapped. Display only. */
  username: string;
  /** ClickUp's email at the time it was mapped. Display only. */
  email: string;
}

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
  /**
   * Overrides for people the email match gets wrong. Empty is the normal case —
   * see {@link ClickUpUserLink}.
   */
  userMap: ClickUpUserLink[];
  connectedAt: string;
  /** '' until the first delivery lands — the "did I wire this up right?" signal. */
  lastEventAt: string;
  /** One line about it, e.g. `Fix login · in progress · 2 links updated`. */
  lastEventSummary: string;
}

/** A fresh connection's non-user fields. */
export function newClickUpDefaults(): Pick<
  ClickUpConfig,
  'enabled' | 'userMap' | 'connectedAt' | 'lastEventAt' | 'lastEventSummary'
> {
  return {
    enabled: true,
    userMap: [],
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
