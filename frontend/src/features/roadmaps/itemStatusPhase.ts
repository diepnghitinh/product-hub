import {
  ROADMAP_ITEM_STATUS_LABEL,
  ROADMAP_PHASE_LABEL,
  RoadmapItemStatus,
  RoadmapPhase,
} from '@/types/enums';
import type { RoadmapColumn } from '@/types/dto';

/**
 * An item's **status** and the **column** it sits in are two readings of the
 * same fact, so they move together.
 *
 * They used to be independent fields: setting an item to Done in its panel left
 * the card parked in Now, which reads as a board that ignored you — you then had
 * to drag it as well, and a board nobody dragged slowly filled with "Done" cards
 * outside the Done column. These two helpers are the whole rule, kept in one
 * place so the panel's Select and the board's drag can't drift apart.
 *
 * Only the **Done** column is derived — Now / Next / Later are a judgement about
 * *when* we'll do something, which no status can infer.
 */

/** The board's Done column, if it has one. Matched by the default `done` key
 *  first, then by label, so a roadmap whose Done column was hand-made in Manage
 *  columns (those get a generated `col-…` key) still counts. */
export function doneColumn(columns: RoadmapColumn[]): RoadmapColumn | undefined {
  const byKey = columns.find((c) => c.key === RoadmapPhase.DONE);
  if (byKey) return byKey;
  const names = [
    ROADMAP_PHASE_LABEL[RoadmapPhase.DONE],
    ROADMAP_ITEM_STATUS_LABEL[RoadmapItemStatus.DONE],
    'done',
  ].map((n) => n.trim().toLowerCase());
  return columns.find((c) => names.includes(c.label.trim().toLowerCase()));
}

/**
 * Where a status change should leave the card.
 *
 *  - **→ Done** files it under the Done column.
 *  - **Done → anything else** takes it back out, to the first column that isn't
 *    Done (i.e. Now) — leaving a live item sitting in Done is the same
 *    contradiction in reverse.
 *  - Everything else stays where the person put it.
 *
 * Returns the current phase unchanged when the board has no Done column.
 */
export function phaseForStatus(
  status: RoadmapItemStatus,
  phase: string,
  columns: RoadmapColumn[],
): string {
  const done = doneColumn(columns);
  if (!done) return phase;
  if (status === RoadmapItemStatus.DONE) return done.key;
  if (phase === done.key) return columns.find((c) => c.key !== done.key)?.key ?? phase;
  return phase;
}

/**
 * The mirror: what a drag says about the item's status.
 *
 *  - Dropped **into** Done → Done.
 *  - Dragged **out of** Done while still marked Done → back to In progress; you
 *    just said it isn't finished.
 *  - Any other move leaves the status alone.
 */
export function statusForPhase(
  phase: string,
  status: RoadmapItemStatus,
  columns: RoadmapColumn[],
): RoadmapItemStatus {
  const done = doneColumn(columns);
  if (!done) return status;
  if (phase === done.key) return RoadmapItemStatus.DONE;
  if (status === RoadmapItemStatus.DONE) return RoadmapItemStatus.IN_PROGRESS;
  return status;
}
