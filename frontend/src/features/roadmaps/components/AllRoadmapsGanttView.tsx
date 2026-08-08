import { useEffect, useMemo, useState } from 'react';
import { MoveHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { t } from '@/i18n';
import { GanttChart, isEpoch, type GanttRow } from '@/components/GanttChart';
import { useIssues, useUpdateIssue } from '@/features/issues/api';
import { IssuePeekDrawer, type IssuePeek } from '@/features/issues/IssuePeekDrawer';
import { useTeamStatusesLookup } from '@/features/teams/api';
import { useAuth } from '@/lib/auth';
import { DEFAULT_ROADMAP_COLUMNS, IssueKind, TeamIssueType } from '@/types/enums';
import type { IssueDto, RoadmapColumn, RoadmapDto, RoadmapItem } from '@/types/dto';
import { useReplaceRoadmapItems } from '../api';
import {
  byIssueDate,
  issueEnd,
  issueStart,
  itemAnchor,
  itemWindow,
  placeOnAxis,
  type DateWindow,
} from '../ganttRows';
import { RoadmapItemPeekDrawer, type RoadmapItemPeek } from './RoadmapItemPeekDrawer';

/** A roadmap's columns, with the shared fallback for one that somehow has none. */
const columnsOf = (r: RoadmapDto): RoadmapColumn[] =>
  r.columns?.length ? r.columns : DEFAULT_ROADMAP_COLUMNS;

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
 * Dates follow the one rule shared with every other timeline (`../ganttRows`):
 * two dates → a bar, one → a diamond, neither → listed but not placed.
 */
export function AllRoadmapsGanttView({ roadmaps, phases, isLoading }: AllRoadmapsGanttViewProps) {
  const { canWrite } = useAuth();
  const statusesFor = useTeamStatusesLookup();
  const updateIssue = useUpdateIssue();
  const replaceItems = useReplaceRoadmapItems();

  const roadmapIds = useMemo(() => roadmaps.map((r) => r.id), [roadmaps]);
  // One query for every roadmap's linked work — the `roadmapId` filter is an
  // `$in`, so N roadmaps still cost one request. Both kinds: `useIssues` is the
  // un-scoped hook, unlike the per-roadmap timeline's task-only `useTasks`.
  //
  // A `[]` here would mean "no filter" (i.e. every issue in the workspace), so
  // this view is only ever mounted with roadmaps in hand — the panel above
  // renders its own empty state instead.
  const { data, isLoading: loadingIssues } = useIssues({ roadmapId: roadmapIds });

  // What a row click opens — one drawer per kind, only ever one at a time.
  const [issuePeek, setIssuePeek] = useState<IssuePeek | null>(null);
  const [itemPeek, setItemPeek] = useState<RoadmapItemPeek | null>(null);

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
  const entries: { item: RoadmapItem; roadmap: RoadmapDto; column?: RoadmapColumn }[] = [];
  for (const roadmap of roadmaps) {
    const cols = columnsOf(roadmap);
    for (const raw of roadmap.items ?? []) {
      if (!phaseSet.has(raw.phase)) continue;
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
  for (const { item, roadmap, column } of entries) {
    const color = column?.color ?? 'hsl(var(--primary))';
    const issues = (issuesByItem.get(item.id) ?? []).slice().sort(byIssueDate);
    const label = item.title || t('roadmaps.untitled');

    rows.push({
      id: `${roadmap.id}:${item.id}`,
      dotColor: color,
      label,
      sublabel: (
        <>
          {/* Which plan this belongs to — the one thing a cross-roadmap row needs
              that a single-roadmap row never did. Inline, so the line still
              truncates as one piece. */}
          <span className="mr-1.5 rounded-sm border px-1 py-px text-[10px] font-medium">
            {roadmap.title}
          </span>
          {column?.label ? `${column.label} · ` : ''}
          {`${item.progress}% · `}
          {issues.length
            ? t('roadmaps.ganttIssues').replace('{count}', String(issues.length))
            : t('roadmaps.ganttNoIssues')}
        </>
      ),
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

  // Every legend line is earned by something actually on the chart.
  const hasItemBars = rows.some((r) => !(r.depth ?? 0) && r.bar);
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
        empty={{ title: t('roadmaps.allGanttEmpty'), hint: t('roadmaps.allGanttEmptyHint') }}
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
