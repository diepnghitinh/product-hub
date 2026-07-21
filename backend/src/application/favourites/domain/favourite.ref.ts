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
 * - `teamId`    — set for a `bug`/`task` that lives on a team board.
 */
export interface FavouriteRef {
  kind: FavouriteKind;
  /** Id of the referenced entity (bug id, task id, or roadmap item id). */
  refId: string;
  /** Snapshot of the entity's title at pin time. */
  title: string;
  /** Owning roadmap id — set for roadmap items. */
  roadmapId?: string;
  /** Owning team id — set for team-scoped bugs/tasks. */
  teamId?: string;
  /** When the user pinned it. */
  createdAt: Date;
}
