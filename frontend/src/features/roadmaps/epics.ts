import { t } from '@/i18n';
import { ROADMAP_COLUMN_PALETTE, RoadmapItemStatus } from '@/types/enums';
import type { RoadmapEpic, RoadmapItem } from '@/types/dto';

/**
 * Everything the board, the table and the timeline need to read an epic. One
 * module because all three group the same items the same way, and a rollup that
 * disagreed between two views would be worse than no rollup at all.
 *
 * **An epic stores nothing but its name and colour.** Its size, progress and
 * dates are computed here from the items inside it, every render. That's the
 * whole reason an epic isn't a backlog item: there is no second copy of the
 * truth to keep in sync, and no way for a group to claim it's 80% done when the
 * items in it say otherwise.
 */

/** The lane items with no epic fall into. Not an epic id — no epic can be ''. */
export const UNGROUPED = '';

/** id → epic, for the many places that render one item's group. */
export function epicIndex(epics: RoadmapEpic[]): Map<string, RoadmapEpic> {
  return new Map(epics.map((e) => [e.id, e]));
}

/** The epic an item is in, or undefined when ungrouped / pointing at a stale id
 *  (the server clears those, but a card can render mid-flight). */
export function epicOf(
  item: Pick<RoadmapItem, 'epicId'>,
  index: Map<string, RoadmapEpic>,
): RoadmapEpic | undefined {
  return item.epicId ? index.get(item.epicId) : undefined;
}

/** What an epic is worth right now, derived from its items. */
export interface EpicRollup {
  count: number;
  /** Items whose status is Done. */
  done: number;
  /** Mean of the items' own progress, 0–100 (0 for an empty epic). */
  progress: number;
  /** Earliest start / latest end across the items that have one ('' if none). */
  startDate: string;
  endDate: string;
}

/**
 * Roll a set of items up into the numbers an epic shows. Dates are the union of
 * the items' windows — the honest answer to "when is this bet happening?" is
 * the span of the work in it, and an epic with nothing scheduled gets no dates
 * rather than a guess (the same rule the timeline already applies to items).
 *
 * ISO `YYYY-MM-DD` sorts lexicographically, so min/max needs no parsing.
 */
export function rollup(items: RoadmapItem[]): EpicRollup {
  let startDate = '';
  let endDate = '';
  let done = 0;
  let progressTotal = 0;
  for (const item of items) {
    if (item.status === RoadmapItemStatus.DONE) done++;
    progressTotal += item.progress || 0;
    // `startedAt`/`completedAt` are ISO timestamps, not days — slice to the day
    // so they compare against the planned dates on the same scale.
    const start = item.startDate || item.startedAt?.slice(0, 10) || '';
    const end = item.endDate || item.completedAt?.slice(0, 10) || '';
    if (start && (!startDate || start < startDate)) startDate = start;
    if (end && (!endDate || end > endDate)) endDate = end;
  }
  return {
    count: items.length,
    done,
    progress: items.length ? Math.round(progressTotal / items.length) : 0,
    startDate,
    endDate,
  };
}

/** One epic's slice of the board, in the order the epics are defined. */
export interface EpicLane {
  /** An epic id, or {@link UNGROUPED}. */
  key: string;
  label: string;
  color: string;
  /** '' for the ungrouped lane. */
  description: string;
  items: RoadmapItem[];
  rollup: EpicRollup;
}

/**
 * Split items into one lane per epic, in the epics' own order, plus a trailing
 * "No epic" lane.
 *
 * Two deliberate rules:
 *  • An epic with no items **still gets a lane** — you just created it and need
 *    somewhere to drop the first item.
 *  • The ungrouped lane appears **only when something is in it**, so a fully
 *    grouped backlog isn't followed by an empty box forever.
 */
export function epicLanes(epics: RoadmapEpic[], items: RoadmapItem[]): EpicLane[] {
  const byEpic = new Map<string, RoadmapItem[]>(epics.map((e) => [e.id, []]));
  const loose: RoadmapItem[] = [];
  for (const item of items) {
    const bucket = item.epicId ? byEpic.get(item.epicId) : undefined;
    // An id no epic answers to reads as ungrouped rather than disappearing.
    (bucket ?? loose).push(item);
  }
  const lanes: EpicLane[] = epics.map((epic) => {
    const list = byEpic.get(epic.id) ?? [];
    return {
      key: epic.id,
      label: epic.label,
      color: epic.color,
      description: epic.description,
      items: list,
      rollup: rollup(list),
    };
  });
  if (loose.length) {
    lanes.push({
      key: UNGROUPED,
      label: t('roadmaps.noEpic'),
      color: 'hsl(var(--muted-foreground))',
      description: '',
      items: loose,
      rollup: rollup(loose),
    });
  }
  return lanes;
}

/** "3 / 8" — how far through an epic the team is, in items rather than percent. */
export function epicCountLabel(r: EpicRollup): string {
  return t('roadmaps.epicDoneOf')
    .replace('{done}', String(r.done))
    .replace('{total}', String(r.count));
}

/** A fresh epic: the first palette colour nothing else is using, so two epics
 *  don't arrive looking identical. */
export function newEpic(existing: RoadmapEpic[]): RoadmapEpic {
  const used = new Set(existing.map((e) => e.color));
  const color =
    ROADMAP_COLUMN_PALETTE.find((p) => !used.has(p.value))?.value ?? ROADMAP_COLUMN_PALETTE[0].value;
  return { id: crypto.randomUUID(), label: '', color, description: '' };
}
