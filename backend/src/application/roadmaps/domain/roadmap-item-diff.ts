import { RoadmapItemData } from './types/roadmap-item.type';

/**
 * Fields whose changes become history rows.
 *
 * Deliberately a fixed, explicit list rather than a walk over every property —
 * see `issue-diff.ts` for the same rationale.
 *
 * An item has TWO lifecycle-ish fields and both are tracked, because they are
 * genuinely different things:
 *  - `phase` (NOT `column`) is the board pool the card sits in. `RoadmapColumn`
 *    is the board's column *configuration* (`key`/`label`/`color`); `phase` is
 *    the item's own field, matching `column.key`.
 *  - `status` is the item's work state (Idea → Planned → In progress → Done).
 *    It is what `ReplaceRoadmapItemsUseCase` reads to stamp `startedAt` /
 *    `completedAt`, so marking an item Done is the single most consequential
 *    thing that happens to it. The spec's §4.3 note once read as "the status
 *    field is `phase`", and the first implementation tracked only `phase`, so
 *    marking a backlog item Done produced ZERO rows. Both are tracked now.
 *
 * Deliberately NOT tracked, each for a stated reason:
 *  - `createdAt` / `startedAt` / `completedAt` — server-stamped consequences of
 *    a `status` change (see the use-case), so logging them would emit a second,
 *    identical-timestamp row for the one event `status` already records.
 *  - `shortId` — server-owned and write-once; it can't change by a user action.
 *  - `progress` — derived from the item's sub-tasks on read, not set by anyone
 *    (see `roadmap-progress.ts`). The event that moves it is a *child's* status
 *    change, which is already a row on that child's own timeline; logging it here
 *    too would attribute "progress 0 → 50" to whoever happened to save the item
 *    next. Same reasoning as the server-stamped timestamps above.
 *  - `imageUrl` — a URL renders as neither a value nor an event worth a row;
 *    same call as `attachments` on an issue.
 *  - `milestoneId` / `objectiveId` / `keyResultId` — the three ids move together
 *    as ONE link change, and `okrLabel` is that same event in readable form, so
 *    only the label is tracked (matching how `roadmapItemId` on an issue is
 *    logged through its label rather than its uuid).
 */
export const TRACKED_FIELDS = [
  'title',
  'description',
  'phase',
  'status',
  'assignees',
  'difficulty',
  'startDate',
  'endDate',
  // RICE inputs. Plain numbers that diff cleanly, and the score derived from
  // them is what orders the whole backlog — "who dropped confidence to 1?" is a
  // real question. Four separate rows for a re-score is honest: they are four
  // separate inputs, and one edit usually moves one of them.
  'reach',
  'impact',
  'confidence',
  'effort',
  'okrLabel',
] as const;

export type TrackedField = (typeof TRACKED_FIELDS)[number];

/**
 * Fields recorded as "changed" with no values shown.
 *
 * `title` is NOT here — it is value-bearing, same as for issues and doc
 * pages: a rename's values *are* the event. "Changed the title" with nothing
 * on either side of the arrow tells a reader nothing they could act on, and
 * the storage argument that justifies hiding a `description` (a 4KB body
 * edited repeatedly) doesn't apply to a short title — the row count is
 * identical either way, only the values shown differ. All three entity types
 * agree: titles carry their values, descriptions do not. Nothing is
 * `description` is here for exactly the reason `issue-diff.ts` states: a long
 * body edited ten times would otherwise store ten copies of it, for something
 * almost nobody reads back. The event is recorded; the prose is not.
 */
export const LONG_TEXT_FIELDS: readonly string[] = ['description'];

/**
 * Bare-id fields with no display form. None today — `phase` already reads as
 * a plain string and `assignees` renders names — but kept as a named,
 * separate set (rather than folded into `LONG_TEXT_FIELDS`) so the two kinds
 * of value-less field stay distinguishable, matching `issue-diff.ts` /
 * `doc-page-diff.ts`.
 */
export const NO_VALUE_FIELDS: readonly string[] = [];

export interface FieldChange {
  field: string;
  oldValue: string;
  newValue: string;
}

/** One item's changes within a single roadmap write. */
export interface ItemChange {
  itemId: string;
  /** The item's own ref (`RM-…`), never the roadmap's. */
  itemRef: string;
  changes: FieldChange[];
}

/** Render one tracked field as the flat string the log stores. */
function read(item: RoadmapItemData, field: TrackedField): string {
  switch (field) {
    case 'assignees':
      return (item.assignees ?? []).map((a) => a.name).join(', ');
    default:
      return String((item as unknown as Record<string, unknown>)[field] ?? '');
  }
}

function refOf(item: RoadmapItemData): string {
  return item.shortId || item.id;
}

/**
 * Diff two snapshots of a roadmap's embedded `items` array.
 *
 * Both `before` and `after` are the WHOLE array, not one item, because a
 * single drag-to-reorder rewrites it wholesale. Items are paired by `id`
 * (never by array position — a reorder changes position for every item
 * without changing any of them), then compared field by field:
 *
 *  - an id present only in `after` is reported as `created`
 *  - an id present only in `before` is reported as `deleted`
 *  - an id present in both is compared field by field; no changed field means
 *    no row at all, which is what makes a pure reorder emit nothing.
 */
export function diffRoadmapItems(
  before: RoadmapItemData[],
  after: RoadmapItemData[],
): ItemChange[] {
  const beforeById = new Map(before.map((i) => [i.id, i]));
  const afterById = new Map(after.map((i) => [i.id, i]));
  const result: ItemChange[] = [];

  for (const [id, item] of afterById) {
    if (beforeById.has(id)) continue;
    result.push({
      itemId: id,
      itemRef: refOf(item),
      changes: [{ field: 'created', oldValue: '', newValue: '' }],
    });
  }

  for (const [id, item] of beforeById) {
    if (afterById.has(id)) continue;
    result.push({
      itemId: id,
      itemRef: refOf(item),
      changes: [{ field: 'deleted', oldValue: '', newValue: '' }],
    });
  }

  for (const [id, afterItem] of afterById) {
    const beforeItem = beforeById.get(id);
    if (!beforeItem) continue; // handled as "created" above

    const changes: FieldChange[] = [];
    for (const field of TRACKED_FIELDS) {
      const prevVal = read(beforeItem, field);
      const nowVal = read(afterItem, field);
      if (prevVal === nowVal) continue;
      const noValue = LONG_TEXT_FIELDS.includes(field) || NO_VALUE_FIELDS.includes(field);
      changes.push({
        field,
        oldValue: noValue ? '' : prevVal,
        newValue: noValue ? '' : nowVal,
      });
    }
    if (changes.length) {
      result.push({ itemId: id, itemRef: refOf(afterItem), changes });
    }
  }

  return result;
}
