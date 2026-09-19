import { ChildRollup } from '@application/issues/domain/issue-progress';
import { RoadmapItemStatus } from './enums/roadmap.enums';

/**
 * How far along a backlog item is — **derived from its work, never dragged**.
 *
 * `RoadmapItemData.progress` used to be a slider in the item's Properties: a
 * number a person set by hand and then had to keep setting. Nothing recomputed
 * it, so finishing a sub-task moved the panel's own "1 of 2 done" bar while the
 * percentage beside it stayed on whatever it was last dragged to — two readings
 * of the same fact, on the same screen, disagreeing. The stored field is now
 * ignored on read (kept in the document only so nothing has to be migrated) and
 * every response computes this instead.
 *
 * The rule is exactly the one `SubtaskSection` shows above the list, so the
 * sidebar and the bar can never drift apart again:
 *
 *  - **Linked work wins.** The issues held by `roadmapItemId`, plus everything
 *    nested under them — done ÷ total. A grandchild is work too.
 *  - **Bugs don't count.** A bug filed against an item is work *found*, not work
 *    *planned*; counting it would make the delivery number fall the moment
 *    someone reported a problem, which is backwards. (This mirrors the panel's
 *    `separateBugs`, which lists them in their own block below the bar.)
 *  - **No linked work → the item's own status.** Done is 100, anything else 0.
 *    An item nobody has broken down yet has no finer answer to give, and this
 *    matches how {@link progressOf} treats a leaf issue.
 */
export function roadmapItemProgress(status: string, rollup?: ChildRollup | null): number {
  if (rollup && rollup.total > 0) {
    return Math.round((rollup.done / rollup.total) * 100);
  }
  return status === RoadmapItemStatus.DONE ? 100 : 0;
}
