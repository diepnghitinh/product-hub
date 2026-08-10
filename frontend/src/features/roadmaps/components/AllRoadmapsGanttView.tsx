import { useEffect, useMemo, useState } from 'react';
import { MoveHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { t } from '@/i18n';
import { GanttChart, isEpoch, toEpoch, type GanttRow } from '@/components/GanttChart';
import { useIssues, useUpdateIssue } from '@/features/issues/api';
import { IssuePeekDrawer, type IssuePeek } from '@/features/issues/IssuePeekDrawer';
import { useTeamStatusesLookup } from '@/features/teams/api';
import { useAuth } from '@/lib/auth';
import { DEFAULT_ROADMAP_COLUMNS, IssueKind, TeamIssueType } from '@/types/enums';
import type { IssueDto, RoadmapColumn, RoadmapDto, RoadmapItem } from '@/types/dto';
import { useReplaceRoadmapItems } from '../api';
import { UNGROUPED, epicCountLabel, rollup, type EpicRollup } from '../epics';
import {
  byIssueDate,
  issueEnd,
  issueStart,
  itemAnchor,
  itemWindow,
  matchesPeople,
  placeOnAxis,
  type DateWindow,
} from '../ganttRows';
import { RoadmapItemPeekDrawer, type RoadmapItemPeek } from './RoadmapItemPeekDrawer';
import { TimelineAssignees } from './TimelineAssignees';

/** A roadmap's columns, with the shared fallback for one that somehow has none. */
const columnsOf = (r: RoadmapDto): RoadmapColumn[] =>
  r.columns?.length ? r.columns : DEFAULT_ROADMAP_COLUMNS;

/** Names a plan inline on a row's second line — the one thing a cross-roadmap row
 *  needs that a single-roadmap row never did. Inline, so the line still truncates
 *  as one piece. */
const CHIP = 'mr-1.5 rounded-sm border px-1 py-px text-[10px] font-medium';

/** A band that stands for something with no colour of its own — a roadmap, or the
 *  items nobody put in an epic. Never a phase colour: on this chart that already
 *  means "which column is it in". */
const NEUTRAL = 'hsl(var(--muted-foreground))';

/** How the rows are banded. `''` — the default — is one flat, date-ordered list. */
export type TimelineGrouping = '' | 'roadmap' | 'epic';

/** One item on the chart, with the two things a cross-roadmap row has to name. */
interface Entry {
  item: RoadmapItem;
  roadmap: RoadmapDto;
  column?: RoadmapColumn;
}

/** A run of entries under one foldable heading. `rollup: null` marks the single
 *  bucket the ungrouped chart uses, which draws no heading at all. */
interface Band {
  key: string;
  label: string;
  color: string;
  /** The plan an epic belongs to. Named on the heading because two roadmaps can
   *  each have an epic called "Payments"; empty when the heading *is* a roadmap. */
  roadmapTitle: string;
  entries: Entry[];
  rollup: EpicRollup | null;
}

/**
 * Band the entries by the plan they came from or the bet they belong to — or hand
 * back the one flat bucket, which is what "No grouping" is.
 *
 * The bands are ordered **by date, like everything else on this chart**: the one
 * that starts soonest is on top, undated ones last. A roadmap has a stored order
 * and an epic has one too, but neither is an answer to "what is happening first?",
 * which is the question this view exists for. The entries inside a band arrive
 * already date-sorted and stay that way.
 *
 * An `epicId` no epic answers to reads as ungrouped rather than dropping the item —
 * the server clears stale ids, but a row can render mid-flight.
 */
function bandEntries(entries: Entry[], grouping: TimelineGrouping): Band[] {
  if (!grouping) {
    return [{ key: '', label: '', color: '', roadmapTitle: '', entries, rollup: null }];
  }

  const bands = new Map<string, Band>();
  for (const entry of entries) {
    const epic =
      grouping === 'epic'
        ? entry.roadmap.epics?.find((e) => e.id === entry.item.epicId)
        : undefined;
    // An epic band is keyed by *its roadmap's* epic, never by the epic id alone:
    // ids are only unique inside the roadmap that owns them, and two plans that
    // happen to share one would otherwise merge into a band whose heading names
    // just one of them.
    const key =
      grouping === 'roadmap'
        ? entry.roadmap.id
        : epic
          ? `${entry.roadmap.id}:${epic.id}`
          : UNGROUPED;
    let band = bands.get(key);
    if (!band) {
      band = {
        key,
        label:
          grouping === 'roadmap'
            ? entry.roadmap.title
            : (epic?.label || (epic ? t('roadmaps.epic') : t('roadmaps.noEpic'))),
        color: grouping === 'roadmap' ? NEUTRAL : (epic?.color ?? NEUTRAL),
        roadmapTitle: epic ? entry.roadmap.title : '',
        entries: [],
        rollup: null,
      };
      bands.set(key, band);
    }
    band.entries.push(entry);
  }
  // A band's window and progress are read off the rows under it, every render —
  // the same rule an epic follows on the board, so a band can't claim to be 80%
  // done when the items in it say otherwise.
  for (const band of bands.values()) band.rollup = rollup(band.entries.map((e) => e.item));

  return [...bands.values()].sort((a, b) => {
    // "No epic" is the leftovers, so it trails whatever was actually grouped.
    if (a.key === UNGROUPED) return 1;
    if (b.key === UNGROUPED) return -1;
    // ISO days compare as strings; '' means nothing in the band is scheduled.
    const sa = a.rollup?.startDate ?? '';
    const sb = b.rollup?.startDate ?? '';
    if (sa && sb && sa !== sb) return sa < sb ? -1 : 1;
    if (!!sa !== !!sb) return sa ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Every phase column across every roadmap, de-duplicated by key and kept in the
 * order they were first met. Two roadmaps can name and colour the same key
 * differently — first one wins, because a filter chip has to be one chip.
 */
export function unionColumns(roadmaps: RoadmapDto[]): RoadmapColumn[] {
  const seen = new Map<string, RoadmapColumn>();
  for (const r of roadmaps) {
    for (const c of columnsOf(r)) if (!seen.has(c.key)) seen.set(c.key, c);
  }
  return [...seen.values()];
}

interface AllRoadmapsGanttViewProps {
  /** Every roadmap to draw. Must be non-empty — see the note on the issue query. */
  roadmaps: RoadmapDto[];
  /** Which phase keys to include. `[]` draws nothing, which is what an emptied
   *  filter honestly means. */
  phases: string[];
  /**
   * Narrow the chart to these people (the toolbar's **Assignee** filter, owned by
   * the panel above because that's where the toolbar is). Ids, plus the
   * `UNASSIGNED` sentinel; empty/omitted = no filter.
   */
  assigneeIds?: string[];
  /**
   * Band the rows under a foldable heading — one per roadmap, or one per epic.
   * Omitted/`''` → the flat, date-ordered list this view has always drawn.
   */
  grouping?: TimelineGrouping;
  isLoading?: boolean;
}

/**
 * One timeline over **every** roadmap, grouped by roadmap item.
 *
 * The per-roadmap timeline (`RoadmapGanttView`) answers "when is this plan
 * happening?". This one answers the question you can't ask from inside a single
 * roadmap — "what is this **workspace** shipping, and when?" — by putting every
 * roadmap's items on one axis, sorted by date rather than by which roadmap they
 * came from. That ordering is the whole point: two items three weeks apart read
 * as three weeks apart even when they belong to different plans.
 *
 * Each roadmap item is a parent row with the issues linked to it (`roadmapItemId`)
 * indented underneath — **tasks and bugs both**, since a roadmap item is delivered
 * by whatever work is attached to it, and a release slipping on a bug is exactly
 * the thing this view exists to show. The roadmap an item belongs to is named by
 * a chip on the row's second line, and the row's colour is its phase column's.
 *
 * `grouping` bands those rows without changing that: by **roadmap**, when the
 * question is "how do our plans sit against each other?", or by **epic**, when
 * it's "which bets are running, and when?". A band's bar is the span of the work
 * inside it and nothing else, so it can't disagree with the rows it covers.
 *
 * Dates follow the one rule shared with every other timeline (`../ganttRows`):
 * two dates → a bar, one → a diamond, neither → listed but not placed.
 */
export function AllRoadmapsGanttView({
  roadmaps,
  phases,
  assigneeIds,
  grouping = '',
  isLoading,
}: AllRoadmapsGanttViewProps) {
  const { canWrite } = useAuth();
  const statusesFor = useTeamStatusesLookup();
  const updateIssue = useUpdateIssue();
  const replaceItems = useReplaceRoadmapItems();

  const roadmapIds = useMemo(() => roadmaps.map((r) => r.id), [roadmaps]);
  const filtering = !!assigneeIds?.length;
  // One query for every roadmap's linked work — the `roadmapId` filter is an
  // `$in`, so N roadmaps still cost one request. Both kinds: `useIssues` is the
  // un-scoped hook, unlike the per-roadmap timeline's task-only `useTasks`.
  //
  // A `[]` here would mean "no filter" (i.e. every issue in the workspace), so
  // this view is only ever mounted with roadmaps in hand — the panel above
  // renders its own empty state instead.
  //
  // The assignee filter is part of the query rather than a `.filter()` below,
  // because the response is capped at a page: narrowing afterwards would search
  // only the first hundred issues and call the result "all of Alice's work".
  const { data, isLoading: loadingIssues } = useIssues({
    roadmapId: roadmapIds,
    assigneeId: filtering ? assigneeIds : undefined,
  });

  // What a row click opens — one drawer per kind, only ever one at a time.
  const [issuePeek, setIssuePeek] = useState<IssuePeek | null>(null);
  const [itemPeek, setItemPeek] = useState<RoadmapItemPeek | null>(null);

  // Which bands are folded shut. Presentational + per-session, like the roadmap
  // board's lanes and the per-roadmap timeline's epics. Keys are roadmap/epic
  // ids, so switching axis can't leave a band folded by a key that isn't its own.
  const [foldedBands, setFoldedBands] = useState<Set<string>>(() => new Set());
  const toggleBand = (key: string) =>
    setFoldedBands((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Dates just dragged, applied over the fetched rows until the refetch agrees.
  // Neither write is optimistic *for this view* — the item write patches the
  // `['roadmap', id]` detail cache, and this screen reads the `['roadmaps']`
  // list — so without these the bar would spring back for the round-trip.
  const [pendingIssues, setPendingIssues] = useState<Record<string, DateWindow>>({});
  const [pendingItems, setPendingItems] = useState<Record<string, DateWindow>>({});

  const fetchedIssues = data?.items;
  useEffect(() => {
    if (!fetchedIssues) return;
    setPendingIssues((prev) => settle(prev, fetchedIssues, (i) => i.id));
  }, [fetchedIssues]);
  useEffect(() => {
    setPendingItems((prev) =>
      settle(
        prev,
        roadmaps.flatMap((r) => r.items ?? []),
        (i) => i.id,
      ),
    );
  }, [roadmaps]);

  const issuesByItem = new Map<string, IssueDto[]>();
  for (const raw of fetchedIssues ?? []) {
    if (!raw.roadmapItemId) continue;
    const p = pendingIssues[raw.id];
    const issue = p ? { ...raw, ...p } : raw;
    const arr = issuesByItem.get(issue.roadmapItemId) ?? [];
    arr.push(issue);
    issuesByItem.set(issue.roadmapItemId, arr);
  }

  // Flatten every roadmap's items into one date-ordered list. The item carries
  // its roadmap and its phase column along, so the row below can name both
  // without going back to look them up.
  const phaseSet = new Set(phases);
  const entries: Entry[] = [];
  for (const roadmap of roadmaps) {
    const cols = columnsOf(roadmap);
    for (const raw of roadmap.items ?? []) {
      if (!phaseSet.has(raw.phase)) continue;
      // Filtering by person drops the items that person has nothing on. An item
      // stays for its *own* people or for any of the work under it — the parent
      // is the context its children are read in, and an item assigned to someone
      // has to survive a filter for that someone, or the row's own badge would be
      // pointing at a name the filter says isn't there.
      if (
        filtering &&
        !issuesByItem.has(raw.id) &&
        !matchesPeople(assigneeIds, raw.assignees ?? [])
      ) {
        continue;
      }
      const p = pendingItems[raw.id];
      entries.push({
        item: p ? { ...raw, ...p } : raw,
        roadmap,
        column: cols.find((c) => c.key === raw.phase),
      });
    }
  }
  // Dated first (soonest at top), undated last — the same rule the issue rows
  // follow, and the reason this view is worth having: two items three weeks apart
  // read as three weeks apart even when they belong to different plans.
  entries.sort((a, b) => {
    const da = itemAnchor(a.item);
    const db = itemAnchor(b.item);
    if (isEpoch(da) && isEpoch(db) && da !== db) return da - db;
    if (isEpoch(da) !== isEpoch(db)) return isEpoch(da) ? -1 : 1;
    // Same date, or neither dated — without a tiebreak these would sit in
    // whatever order the roadmaps happened to load in.
    return (a.item.title || '').localeCompare(b.item.title || '');
  });

  /** An item's dates live in its own roadmap's items array, which is written
   *  whole — so the write goes back to *that* roadmap, not the one on screen. */
  const rescheduleItem = (item: RoadmapItem, roadmap: RoadmapDto, next: DateWindow) => {
    setPendingItems((p) => ({ ...p, [item.id]: next }));
    replaceItems.mutate(
      {
        id: roadmap.id,
        items: (roadmap.items ?? []).map((i) => (i.id === item.id ? { ...i, ...next } : i)),
      },
      {
        onError: () => setPendingItems(({ [item.id]: _dropped, ...rest }) => rest),
      },
    );
  };

  const rescheduleIssue = (issue: IssueDto, next: DateWindow) => {
    setPendingIssues((p) => ({ ...p, [issue.id]: next }));
    updateIssue.mutate(
      { id: issue.id, input: next },
      {
        onError: (err) => {
          // Drop back to the stored dates and say why — an unexplained snap-back
          // just reads as a broken timeline.
          setPendingIssues(({ [issue.id]: _dropped, ...rest }) => rest);
          toast.error(t('roadmaps.ganttSaveFailed'), { description: err.message });
        },
      },
    );
  };

  const rows: GanttRow[] = [];
  for (const band of bandEntries(entries, grouping)) {
    const folded = foldedBands.has(band.key);
    if (band.rollup) {
      rows.push({
        id: `band:${grouping}:${band.key}`,
        heading: true,
        collapsed: folded,
        dotColor: band.color,
        label: band.label,
        sublabel: (
          <>
            {band.roadmapTitle && <span className={CHIP}>{band.roadmapTitle}</span>}
            {`${band.rollup.progress}% · ${epicCountLabel(band.rollup)}`}
          </>
        ),
        onClick: () => toggleBand(band.key),
        // Deliberately no `onChange`: a band's window is the union of the rows
        // under it, and spreading a drag back over them has no honest answer.
        ...placeOnAxis({
          start: toEpoch(band.rollup.startDate),
          end: toEpoch(band.rollup.endDate),
          color: band.color,
          progress: band.rollup.progress,
          label: band.label,
        }),
      });
      if (folded) continue;
    }

    // Which plan a row belongs to only needs saying when the heading above doesn't.
    // A roadmap band says it once; an epic band is scoped to a single plan and
    // names it on the heading too. "No epic" is the exception — it's the leftovers
    // from *every* roadmap, so its rows still have to say where they came from.
    const namesPlan = grouping !== 'roadmap' && !band.roadmapTitle;

    for (const { item, roadmap, column } of band.entries) {
      const color = column?.color ?? 'hsl(var(--primary))';
      const issues = (issuesByItem.get(item.id) ?? []).slice().sort(byIssueDate);
      const label = item.title || t('roadmaps.untitled');

      rows.push({
        id: `${roadmap.id}:${item.id}`,
        dotColor: color,
        label,
        sublabel: (
          <>
            {namesPlan && <span className={CHIP}>{roadmap.title}</span>}
            {column?.label ? `${column.label} · ` : ''}
            {`${item.progress}% · `}
            {issues.length
              ? t('roadmaps.ganttIssues').replace('{count}', String(issues.length))
              : t('roadmaps.ganttNoIssues')}
          </>
        ),
        // An item carries its own people (its DRIs), separately from whoever is
        // on the work underneath it.
        trailing: <TimelineAssignees people={item.assignees} />,
        onClick: () =>
          setItemPeek({
            roadmapId: roadmap.id,
            itemId: item.id,
            href: `/roadmaps/${roadmap.id}/items/${item.shortId || item.id}`,
          }),
        ...placeOnAxis({
          ...itemWindow(item),
          color,
          progress: item.progress,
          label,
          suffix: roadmap.title,
          onChange: canWrite ? (next) => rescheduleItem(item, roadmap, next) : undefined,
        }),
      });

      for (const issue of issues) {
        const issueType = issue.kind === IssueKind.BUG ? TeamIssueType.BUG : TeamIssueType.TASK;
        const cfg = statusesFor(issue.teamId, issueType).find((c) => c.key === issue.status);
        const st = {
          color: cfg?.color ?? 'hsl(var(--muted-foreground))',
          label: cfg?.label ?? issue.status,
        };
        rows.push({
          id: `${roadmap.id}:${item.id}:${issue.id}`,
          depth: 1,
          dotColor: st.color,
          label: issue.title,
          trailing: <TimelineAssignees people={issue.assignees} />,
          onClick: () =>
            setIssuePeek({
              id: issue.id,
              issueType,
              href: `/issues/${issue.shortId || issue.id}`,
            }),
          // No `progress`: an issue bar is a schedule, not a fill level.
          ...placeOnAxis({
            start: issueStart(issue),
            end: issueEnd(issue),
            color: st.color,
            label: issue.title,
            suffix: st.label,
            onChange: canWrite ? (next) => rescheduleIssue(issue, next) : undefined,
          }),
        });
      }
    }
  }

  // Every legend line is earned by something actually on the chart. A band's own
  // bar doesn't earn one: it's the union of the item bars below it, and it has
  // its own two-layer look for exactly that reason.
  const hasItemBars = rows.some((r) => !r.heading && !(r.depth ?? 0) && r.bar);
  const hasIssueBars = rows.some((r) => (r.depth ?? 0) > 0 && r.bar);
  const hasMarkers = rows.some((r) => r.marker);
  // The list is capped at the API's page size. Saying so beats a chart that
  // quietly leaves work off and still looks complete.
  const truncated = data ? data.total - data.items.length : 0;

  return (
    <>
      <GanttChart
        rows={rows}
        isLoading={isLoading || loadingIssues}
        labelHeader={t('roadmaps.item')}
        // Same reason as the per-roadmap timeline: these rows name who's on them
        // as well as what they are, and 200px isn't enough for both.
        railDefault={320}
        empty={
          filtering
            ? { title: t('roadmaps.ganttNoMatches'), hint: t('roadmaps.ganttNoMatchesHint') }
            : { title: t('roadmaps.allGanttEmpty'), hint: t('roadmaps.allGanttEmptyHint') }
        }
        legend={
          <>
            {hasItemBars && (
              <span className="flex items-center gap-1.5">
                {/* Two layers, like the bar itself: a translucent track with a
                    fill — so the swatch reads apart from an issue's solid bar. */}
                <span className="relative h-2.5 w-6" aria-hidden>
                  <span className="absolute inset-0 rounded-full bg-muted-foreground opacity-30" />
                  <span className="absolute inset-y-0 left-0 w-3 rounded-full bg-muted-foreground" />
                </span>
                {t('roadmaps.ganttLegendBar')}
              </span>
            )}
            {hasIssueBars && (
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-6 rounded-full bg-muted-foreground" aria-hidden />
                {t('roadmaps.ganttLegendIssueBar')}
              </span>
            )}
            {hasMarkers && (
              <span className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rotate-45 rounded-[2px] bg-muted-foreground"
                  aria-hidden
                />
                {t('roadmaps.ganttLegendMarker')}
              </span>
            )}
            {canWrite && (hasItemBars || hasIssueBars) && (
              <span className="flex items-center gap-1.5">
                <MoveHorizontal className="size-3.5" aria-hidden />
                {t('roadmaps.ganttDragHint')}
              </span>
            )}
            {truncated > 0 && (
              <span className="text-warning">
                {t('roadmaps.allGanttTruncated')
                  .replace('{shown}', String(data!.items.length))
                  .replace('{total}', String(data!.total))}
              </span>
            )}
          </>
        }
      />

      <IssuePeekDrawer peek={issuePeek} onClose={() => setIssuePeek(null)} />
      <RoadmapItemPeekDrawer peek={itemPeek} onClose={() => setItemPeek(null)} />
    </>
  );
}

/**
 * Drop the pending windows the server has now confirmed. Returns the same object
 * when nothing settled, so it never re-renders for a no-op.
 */
function settle<T extends { startDate?: string; endDate?: string }>(
  prev: Record<string, DateWindow>,
  fetched: T[],
  idOf: (row: T) => string,
): Record<string, DateWindow> {
  if (!Object.keys(prev).length) return prev;
  const next = { ...prev };
  let settled = false;
  for (const row of fetched) {
    const p = next[idOf(row)];
    if (p && row.startDate === p.startDate && row.endDate === p.endDate) {
      delete next[idOf(row)];
      settled = true;
    }
  }
  return settled ? next : prev;
}
