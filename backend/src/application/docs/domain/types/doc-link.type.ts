import { DocLinkKind } from '../enums/doc.enums';

/**
 * A record a doc page is attached to (the "Link Task or Doc" row). A denormalized
 * snapshot — enough to render the chip and route to the record without fetching
 * it — in the same spirit as `FavouriteRef`. `title` may drift if the record is
 * renamed later; that's the accepted trade-off for a lightweight shortcut.
 *
 * Location fields say where the record lives so a link can be built:
 * - `roadmapId` — set for `roadmap-item` (its board route + `?item=` deep-link).
 * - `issueKind` — set for an `issue`; says whether to route to a bug or a task.
 */
export interface DocLinkRef {
  kind: DocLinkKind;
  /** Id of the linked record (issue id, or roadmap item id). */
  refId: string;
  /** Snapshot of the record's title at link time. */
  title: string;
  /** Owning roadmap id — set for roadmap items. */
  roadmapId?: string;
  /** Concrete issue kind (bug/task) — set for `issue` links only. */
  issueKind?: 'bug' | 'task';
}
