import { FavouriteKind } from './favourite-kind.enum';

/**
 * A pinned entity as stored on the user. A denormalized snapshot — enough to
 * render and open the item straight from the sidebar without re-fetching it — so
 * the rail loads instantly. `title` may drift if the entity is renamed later;
 * that's an accepted trade-off for a lightweight shortcut (a future reconcile can
 * refresh it).
 *
 * Location fields say where the entity lives so the sidebar can build a link:
 * - `roadmapId` — set for `roadmap-item` (its board route + `?item=` deep-link).
 * - `teamId`    — set for an `issue` that lives on a team board.
 * - `issueKind` — set for an `issue`; says whether it's a bug or task so the
 *   sidebar can route (/bugs vs /tasks) and pick the right icon. A denormalized
 *   routing hint, in the same spirit as `teamId`/`roadmapId`.
 */
export interface FavouriteRef {
  kind: FavouriteKind;
  /** Id of the referenced entity (issue id, roadmap item id, or doc id). */
  refId: string;
  /** Snapshot of the entity's title at pin time. */
  title: string;
  /** Owning roadmap id — set for roadmap items. */
  roadmapId?: string;
  /** Owning team id — set for team-scoped issues. */
  teamId?: string;
  /** Concrete issue kind (bug/task) — set for `issue` favourites only. */
  issueKind?: 'bug' | 'task';
  /** When the user pinned it. */
  createdAt: Date;
}
