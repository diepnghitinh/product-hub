import {
  UNASSIGNED,
  dateRangeParams,
  decodeDateRange,
  type FilterCategory,
  type FilterSelections,
} from '@/components/FilterMenu';
import { t } from '@/i18n';

/**
 * The filter axes **every** issue board shares — who it's on, who opened it, when
 * it came in, when it was solved.
 *
 * They live here rather than in each page because that's exactly how the boards
 * drifted: `/bugs` grew the two date windows, the task and team boards never did,
 * and none of them could answer "who reported this?". A board composes this block
 * after its own kind-specific axes (status, severity / backlog item, project), so
 * the same four rows sit in the same order in every Filter menu.
 *
 * The people list is manager-only (`useUsers` is gated on `canManageDelivery`), so
 * both people axes lead with a self row — without it a member could not narrow to
 * their own work at all.
 */

/** Category ids — the keys the selections are stored under. Shared so a page and
 *  {@link issueSharedFilterParams} can't disagree about a name. */
export const ISSUE_FILTER = {
  assignee: 'assigneeId',
  creator: 'createdBy',
  created: 'createdAt',
  solved: 'resolvedAt',
  scheduled: 'scheduledAt',
} as const;

/** Just enough of a user to label an option. */
interface FilterPerson {
  id: string;
  name: string;
}

export interface PeopleFilterOptions {
  /** The signed-in user — gets the "…me" row at the top of both people axes. */
  user?: FilterPerson | { id: string } | null;
  /** Workspace people; empty for a member, who still gets their own row. */
  users?: FilterPerson[];
  /**
   * Drop the assignee axis on a board that is already one person's ("Assigned to
   * me"), where narrowing by assignee can only ever return the same list.
   */
  includeAssignee?: boolean;
}

/**
 * The two **people** axes — who it's on, who created it — on their own, because
 * they are not an issue thing.
 *
 * The roadmap board asks the same two questions of items that carry the same two
 * denormalized fields, and it has none of the rest of the block (an item has no
 * `resolvedAt`, and its dates are the timeline's, not a window to narrow by).
 * Sharing the rows rather than re-typing them is what keeps one id (`assigneeId`,
 * `createdBy`), one label, and one "…me" row across every board — the drift this
 * file exists to stop.
 */
export function peopleFilterCategories({
  user,
  users,
  includeAssignee = true,
}: PeopleFilterOptions): FilterCategory[] {
  /** Everyone but me — I'm already pinned at the top as the "…me" row. */
  const others = (users ?? []).filter((u) => u.id !== user?.id);

  return [
    ...(includeAssignee
      ? [
          {
            id: ISSUE_FILTER.assignee,
            label: t('filters.assignee'),
            searchable: true,
            options: [
              ...(user ? [{ id: user.id, label: t('filters.assignedToMe') }] : []),
              { id: UNASSIGNED, label: t('filters.unassigned') },
              ...others.map((u) => ({ id: u.id, label: u.name })),
            ],
          } satisfies FilterCategory,
        ]
      : []),
    {
      // Who opened it. Every issue carries `createdBy` (a bug mirrors it into
      // `reporterId`), so this is the one axis that works identically on both kinds.
      id: ISSUE_FILTER.creator,
      label: t('filters.creator'),
      searchable: true,
      options: [
        ...(user ? [{ id: user.id, label: t('filters.createdByMe') }] : []),
        ...others.map((u) => ({ id: u.id, label: u.name })),
      ],
    },
  ];
}

export type IssueSharedFilterOptions = PeopleFilterOptions;

/** The shared block, in board order: assignee · creator · created · solved. */
export function issueSharedFilters(options: IssueSharedFilterOptions): FilterCategory[] {
  return [
    ...peopleFilterCategories(options),
    // "What came in this week?" and "what did we actually close last month?" — the
    // two questions the status columns can't answer.
    { id: ISSUE_FILTER.created, label: t('filters.createdDate'), type: 'date' },
    // Solved = the moment it entered a done status (`resolvedAt`, stamped
    // server-side). Anything still open has no solved date, so a window here
    // narrows to solved issues on its own.
    { id: ISSUE_FILTER.solved, label: t('filters.solvedDate'), type: 'date' },
    // Scheduled = the issue's own start→end run, matched by *overlap*: anything
    // that was being worked on at any point in the window, not only what began
    // or ended inside it. This is the axis that answers "what did we have on in
    // July?" — the created/solved windows can't, because an issue opened in June
    // and closed in August was worked all through July and appears in neither.
    // The quick-picks stay the shared backward-looking set: this axis exists to
    // answer what a period *contained*, and a period you're reviewing has
    // already happened. A forward window is still one typed range away.
    { id: ISSUE_FILTER.scheduled, label: t('filters.scheduledDate'), type: 'date' },
  ];
}

/** What the shared block contributes to a list query. */
export interface IssueSharedFilterParams {
  assigneeId?: string[];
  createdBy?: string[];
  createdFrom?: string;
  createdTo?: string;
  resolvedFrom?: string;
  resolvedTo?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
}

/**
 * The picked selections → API params. The two date windows are resolved as the
 * *user's* calendar days rather than sent as bare `YYYY-MM-DD` — see
 * `dateRangeParams` for why that matters east of UTC.
 */
export function issueSharedFilterParams(filters: FilterSelections): IssueSharedFilterParams {
  const created = dateRangeParams(decodeDateRange(filters[ISSUE_FILTER.created]));
  const solved = dateRangeParams(decodeDateRange(filters[ISSUE_FILTER.solved]));
  // Deliberately *not* run through `dateRangeParams`. Created/solved are
  // timestamps, so their window has to be resolved to the user's own instants;
  // `startDate`/`endDate` are plain calendar days with no time and no zone —
  // "3 August" on a plan means 3 August everywhere. Widening them to instants
  // would re-introduce exactly the off-by-one the other two are avoiding.
  const scheduled = decodeDateRange(filters[ISSUE_FILTER.scheduled]);
  return {
    assigneeId: filters[ISSUE_FILTER.assignee],
    createdBy: filters[ISSUE_FILTER.creator],
    createdFrom: created.from,
    createdTo: created.to,
    resolvedFrom: solved.from,
    resolvedTo: solved.to,
    scheduledFrom: scheduled.start || undefined,
    scheduledTo: scheduled.end || undefined,
  };
}
