import {
  UNASSIGNED,
  decodeDateRange,
  type FilterCategory,
  type FilterSelections,
} from '@/components/FilterMenu';
import { t } from '@/i18n';
import {
  ROADMAP_DIFFICULTIES,
  ROADMAP_DIFFICULTY_COLOR,
  ROADMAP_DIFFICULTY_LABEL,
  ROADMAP_ITEM_STATUSES,
  ROADMAP_ITEM_STATUS_COLOR,
  ROADMAP_ITEM_STATUS_LABEL,
} from '@/types/enums';
import {
  ISSUE_FILTER,
  peopleFilterCategories,
  type PeopleFilterOptions,
} from '@/features/issues/issueFilters';
import type { RoadmapColumn, RoadmapItem } from '@/types/dto';

/**
 * Narrowing a roadmap board.
 *
 * Unlike every issue board, this one filters in the browser: a roadmap's items
 * are embedded in the roadmap document and arrive as one payload, so there is no
 * list query to add params to — and there mustn't be. The board *writes* by
 * POSTing its whole item array back, so a filter that reached the API would hand
 * the next drag a truncated array to save. The filter narrows what is drawn;
 * `allItems` stays whole and stays what writes are built from.
 *
 * The axes are the item's own fields, matched with the same category ids the
 * issue boards use wherever the question is the same (`status`, `assigneeId`,
 * `createdBy`, `createdAt`, `scheduledAt`), so a URL means one thing on any
 * board. Filtering here is *and-across-axes, or-within-one* — the same reading
 * the API gives an issue list.
 */

/** Category ids — the keys the selections are stored under (and the `f.<id>`
 *  names in the URL). `status` matches the issue boards' own status axis; the
 *  rest are the roadmap's own vocabulary. */
export const ROADMAP_FILTER = {
  status: 'status',
  phase: 'phase',
  difficulty: 'difficulty',
  okr: 'objectiveId',
} as const;

/** "Not linked to an objective" — its own question, not an id that happens to
 *  match nothing. The complement of an OKR pick is the one thing an OKR list
 *  can't show you, and "what are we building that no objective asked for?" is
 *  the question a backlog review is *for*. */
export const NO_OKR = '__no_okr__';

/** Every axis this module narrows on, in menu order. Anything else in the
 *  selections (a leftover `f.projectId` from another board) is ignored. */
const AXES = [
  ROADMAP_FILTER.status,
  ROADMAP_FILTER.phase,
  ROADMAP_FILTER.difficulty,
  ROADMAP_FILTER.okr,
  ISSUE_FILTER.assignee,
  ISSUE_FILTER.creator,
  ISSUE_FILTER.created,
  ISSUE_FILTER.scheduled,
] as const;

export interface RoadmapFilterOptions extends PeopleFilterOptions {
  /** The roadmap's own columns — the Phase axis *is* this list, so a renamed or
   *  added column shows up in the filter with no second place to edit. */
  columns: RoadmapColumn[];
  /** Every item on the board, **unfiltered**: the OKR axis is built from what is
   *  actually linked, so it lists the objectives this roadmap serves rather than
   *  every objective in the workspace. */
  items: RoadmapItem[];
}

/**
 * The Filter menu's rows: status · phase · difficulty · OKR · assignee ·
 * creator · created · scheduled.
 *
 * The item's own axes come first, then the shared people block, then the two
 * date windows — the same order every issue board's menu uses.
 */
export function roadmapFilterCategories({
  columns,
  items,
  ...people
}: RoadmapFilterOptions): FilterCategory[] {
  // One row per objective the board actually links to, labelled with the leaf
  // title the cards already show. `okrLabel` is denormalized onto the item, so
  // this needs no fetch and can't disagree with the card.
  const objectives = new Map<string, string>();
  for (const item of items) {
    if (item.objectiveId) objectives.set(item.objectiveId, item.okrLabel || item.objectiveId);
  }

  return [
    {
      // Where the item *is* — its own lifecycle, which is not the column it sits
      // in: a Now-column item can still be an Idea, and that gap is worth seeing.
      id: ROADMAP_FILTER.status,
      label: t('roadmaps.status'),
      options: ROADMAP_ITEM_STATUSES.map((s) => ({
        id: s,
        label: ROADMAP_ITEM_STATUS_LABEL[s],
        color: ROADMAP_ITEM_STATUS_COLOR[s],
      })),
    },
    {
      // Now / Next / Later — the board's columns, whatever this roadmap calls
      // them. Redundant on the board (you can see the columns) and the point of
      // the axis everywhere else: "show me the timeline of Next".
      id: ROADMAP_FILTER.phase,
      label: t('roadmaps.phase'),
      options: columns.map((c) => ({ id: c.key, label: c.label, color: c.color })),
    },
    {
      id: ROADMAP_FILTER.difficulty,
      label: t('roadmaps.difficulty'),
      options: ROADMAP_DIFFICULTIES.map((d) => ({
        id: d,
        label: ROADMAP_DIFFICULTY_LABEL[d],
        color: ROADMAP_DIFFICULTY_COLOR[d],
      })),
    },
    // Dropped whole when nothing on the board is linked: an axis whose only row
    // is "No objective" matches everything and tells you nothing.
    ...(objectives.size
      ? [
          {
            id: ROADMAP_FILTER.okr,
            label: t('roadmaps.okr'),
            searchable: objectives.size > 8,
            options: [
              ...[...objectives].map(([id, label]) => ({ id, label })),
              { id: NO_OKR, label: t('filters.noOkr') },
            ],
          } satisfies FilterCategory,
        ]
      : []),
    // Assignee · creator — the same two rows, with the same "…me" option, as
    // every issue board.
    ...peopleFilterCategories(people),
    { id: ISSUE_FILTER.created, label: t('filters.createdDate'), type: 'date' },
    // The item's own planned window, matched by *overlap* — anything on the plan
    // at any point in the range, not only what starts or ends inside it. This is
    // the axis that pairs with the timeline: "what did we have on in Q3?".
    { id: ISSUE_FILTER.scheduled, label: t('filters.scheduledDate'), type: 'date' },
  ];
}

/** True when `filters` holds nothing this module narrows on — the caller can
 *  then skip the pass entirely and hand the original array straight through. */
export function hasRoadmapFilters(filters: FilterSelections): boolean {
  return AXES.some((axis) => filters[axis]?.length);
}

/** An ISO timestamp → the `YYYY-MM-DD` of the day it fell on **for this
 *  viewer**. `createdAt` is an instant, and a date filter is asked in the user's
 *  own days: east of UTC, an item created at 08:00 local is still "yesterday" if
 *  its UTC day is read instead. */
function localDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A `YYYY-MM-DD` inside an inclusive window, either end of which may be open. */
const dayInRange = (day: string, start: string, end: string) =>
  !!day && (!start || day >= start) && (!end || day <= end);

/**
 * The items a board should draw, given the picked filters.
 *
 * Within one axis the picks are OR-ed (`Ana` or `Minh`), across axes AND-ed
 * ("Ana's in-progress items in Next") — the same reading the API gives an issue
 * list, so the two behave alike.
 */
export function filterRoadmapItems(
  items: RoadmapItem[],
  filters: FilterSelections,
): RoadmapItem[] {
  if (!hasRoadmapFilters(filters)) return items;

  const statuses = filters[ROADMAP_FILTER.status] ?? [];
  const phases = filters[ROADMAP_FILTER.phase] ?? [];
  const difficulties = filters[ROADMAP_FILTER.difficulty] ?? [];
  const okrs = filters[ROADMAP_FILTER.okr] ?? [];
  const assignees = filters[ISSUE_FILTER.assignee] ?? [];
  const creators = filters[ISSUE_FILTER.creator] ?? [];
  const created = decodeDateRange(filters[ISSUE_FILTER.created]);
  const scheduled = decodeDateRange(filters[ISSUE_FILTER.scheduled]);

  return items.filter((item) => {
    if (statuses.length && !statuses.includes(item.status)) return false;
    if (phases.length && !phases.includes(item.phase)) return false;
    if (difficulties.length && !difficulties.includes(item.difficulty)) return false;
    if (okrs.length) {
      const linked = item.objectiveId || '';
      const match = okrs.some((id) => (id === NO_OKR ? !linked : id === linked));
      if (!match) return false;
    }
    if (assignees.length) {
      const on = item.assignees ?? [];
      const match = assignees.some((id) =>
        // The sentinel is its own question — "nobody is on this" — not a user id
        // that happens never to match.
        id === UNASSIGNED ? on.length === 0 : on.some((a) => a.id === id),
      );
      if (!match) return false;
    }
    if (creators.length) {
      // An item created before the board stored a creator has none, and matches
      // no pick — including the signed-in user's own row. Guessing a creator for
      // it would be a worse answer than leaving it out:
      // `backfill:roadmap-item-creator` recovers the ones the activity log can
      // still account for.
      //
      // The blank is checked first and on purpose. A legacy item's creator is ''
      // (the API's "unknown"), and so is an empty `f.createdBy=` in a hand-edited
      // URL — without this, that empty pick would match every legacy item and
      // read as a hidden "no creator" filter nobody chose.
      const by = item.createdById ?? '';
      if (!by || !creators.includes(by)) return false;
    }
    if (created.start || created.end) {
      // A draft item has no `createdAt` yet, so it can't be in any window — the
      // same answer a creatorless item gets from the creator axis.
      if (!dayInRange(localDay(item.createdAt ?? ''), created.start, created.end)) return false;
    }
    if (scheduled.start || scheduled.end) {
      // Overlap, not containment. A one-ended item is treated as the single day
      // it has; an item with no dates at all is *not* on the plan for any
      // window, so a scheduled filter narrows to scheduled items on its own —
      // the same way the issue boards' solved-date window narrows to solved.
      const from = item.startDate || item.endDate;
      const to = item.endDate || item.startDate;
      if (!from || !to) return false;
      if (scheduled.end && from > scheduled.end) return false;
      if (scheduled.start && to < scheduled.start) return false;
    }
    return true;
  });
}
