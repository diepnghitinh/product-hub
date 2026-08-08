import { Result } from '@shared/logic/result';
import { IssueEntity } from '@application/issues/domain/entities/issue.entity';
import { RoadmapItemData } from '@application/roadmaps/domain/types/roadmap-item.type';

/**
 * Port for pushing work out to a bound ClickUp list.
 *
 * **Best-effort by contract.** Implementations never throw into the calling
 * use-case and never make it wait on anything that matters: ClickUp being down,
 * a revoked token, a list somebody deleted — none of those may stop a person
 * saving an issue here. A failed push is logged and dropped; the next edit to
 * that issue tries again.
 *
 * The direction is deliberately lopsided, and it's the whole product decision:
 * title, description, dates, priority and assignees only ever travel **out**, so
 * nobody with ClickUp access can rename or reassign a record in this workspace.
 * **Status is the one field that travels both ways** — and its inbound half
 * doesn't live here, it lives in the webhook use-case, because it arrives as a
 * delivery rather than as something a use-case in this codebase did.
 *
 * Why a port at all rather than calling the sync service directly: the
 * application integrations module already imports the issues module, so issues
 * cannot import it back. The port lives here, the implementation lives in
 * `infrastructure/integrations`, and the cycle never forms — the same shape as
 * {@link INotifier}.
 */
export abstract class IClickUpSync {
  /**
   * An issue was created. If its team has an enabled binding, this mints the
   * matching ClickUp task and records the link.
   *
   * Personal tasks are skipped by the implementation — a private board has no
   * team, so it has no binding, and pushing someone's private list into a shared
   * ClickUp workspace would be a leak rather than a feature.
   */
  abstract issueCreated(issue: IssueEntity): Promise<void>;

  /**
   * An issue changed — a field edit, or a move to another column.
   *
   * Creates the ClickUp task if the issue predates the binding. That's how a
   * board someone binds today fills in: gradually, as work actually moves,
   * rather than by firing hundreds of task-creates into a customer's workspace
   * the moment they press save.
   */
  abstract issueChanged(issue: IssueEntity): Promise<void>;

  /**
   * Backlog items changed on a roadmap.
   *
   * Takes a list because roadmap edits arrive as a wholesale replace of the
   * items array — one drag can touch several items' `order`, and the caller
   * hands over exactly the ones whose synced fields actually differ.
   */
  abstract roadmapItemsChanged(
    tenantId: string,
    roadmapId: string,
    items: RoadmapItemData[],
  ): Promise<void>;

  /**
   * Push one issue to its team's list **right now**, because somebody asked.
   *
   * The same write as {@link issueChanged} — same fields, same `sync`-origin
   * link, so a task minted here is indistinguishable from one the board minted
   * itself. What differs is the silence.
   *
   * Everything above is best-effort because nobody asked for it: it rides along
   * with a save, and a save must not fail because ClickUp is down. This is the
   * opposite — it *is* the thing that was asked for, so "nothing happened" is
   * never an acceptable answer, and the two ways it can not happen are reported
   * differently on purpose:
   *
   * - **A configuration answer comes back as a failed `Result`** — not connected,
   *   the board isn't bound, syncing is paused. Nothing is wrong; there is simply
   *   nowhere for this to go, and the sentence says which.
   * - **A ClickUp fault throws.** A 401, a deleted list, a network that didn't
   *   answer. The caller catches it and words it for its own screen, the way the
   *   linking use-cases already do.
   *
   * Why this exists at all, when {@link issueChanged} already creates the task
   * for an issue that predates the binding: it only does that on the *next edit*.
   * An issue nobody touches again never appears in ClickUp, and nothing on the
   * screen says so. This is how that issue gets there without inventing an edit.
   */
  abstract pushIssueNow(issue: IssueEntity): Promise<Result<void>>;

  /** {@link pushIssueNow} for a backlog item — same contract, same reasons. */
  abstract pushRoadmapItemNow(
    tenantId: string,
    roadmapId: string,
    item: RoadmapItemData,
  ): Promise<Result<void>>;
}
