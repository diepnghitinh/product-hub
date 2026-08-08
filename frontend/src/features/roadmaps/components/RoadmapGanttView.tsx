import { useEffect, useState } from 'react';
import { MoveHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { t } from '@/i18n';
import { GanttChart, toEpoch, type GanttRow } from '@/components/GanttChart';
import { useTasks, useUpdateTask } from '@/features/tasks/api';
import { useTeamStatusesLookup } from '@/features/teams/api';
import { useAuth } from '@/lib/auth';
import { TeamIssueType } from '@/types/enums';
import type { RoadmapColumn, RoadmapEpic, RoadmapItem, TaskDto } from '@/types/dto';
import { useReplaceRoadmapItems } from '../api';
import { epicCountLabel, epicLanes } from '../epics';
import {
  byIssueDate,
  issueEnd,
  issueStart,
  itemWindow,
  placeOnAxis,
  type DateWindow,
} from '../ganttRows';
import { IssuePeekDrawer, type IssuePeek } from '@/features/issues/IssuePeekDrawer';
import { RoadmapItemPeekDrawer, type RoadmapItemPeek } from './RoadmapItemPeekDrawer';

/** Re-exported for the callers that held it here before the date rules moved into
 *  `../ganttRows` (shared with the all-roadmaps timeline). */
export type { DateWindow };

interface RoadmapGanttProps {
  /** All roadmap items — filtered to the "Now" column here. */
  items: RoadmapItem[];
  columns: RoadmapColumn[];
  /** The roadmap's epics; only consulted when `groupByEpic` is on. */
  epics?: RoadmapEpic[];
  /** Group the rows under a foldable epic parent row, whose bar is the span of
   *  the work inside it. Off → one flat list of items, as before. */
  groupByEpic?: boolean;
  onOpenItem: (id: string) => void;
  /**
   * Tasks linked to each item, keyed by `roadmapItemId`. Omit (public views) to
   * render item bars only — no child markers, no authenticated task fetch.
   */
  tasksByItem?: Map<string, TaskDto[]>;
  /** Marker colour + label for a linked task; only consulted when `tasksByItem` has rows. */
  taskStatus?: (task: TaskDto) => { color: string; label: string };
  /** A linked task's detail link; omit → the row isn't a link (public). */
  taskHref?: (task: TaskDto) => string | undefined;
  /** Peek a linked task in place (a drawer) instead of following `taskHref`.
   *  Takes precedence over it — the drawer carries its own "open full page" link. */
  onOpenTask?: (task: TaskDto) => void;
  /**
   * Makes a linked task's bar **draggable** (moves the whole window) and
   * **resizable** (drag an edge to change just that date). Omit — public view,
   * or no write access — and the task rows are read-only.
   */
  onTaskDatesChange?: (task: TaskDto, next: DateWindow) => void;
  /**
   * The same for a backlog item's own bar. An item stores its own start/end pair,
   * so dragging writes them straight back. Only an item that already *has* a
   * window can be dragged — an unscheduled one has no bar to take hold of, and its
   * dates are set in the detail panel. Omit for the public view.
   */
  onItemDatesChange?: (item: RoadmapItem, next: DateWindow) => void;
  isLoading?: boolean;
}

/**
 * The presentational roadmap timeline: the "Now" column's items as bars, each
 * optionally grouped with the tasks linked to it (`roadmapItemId`). A thin adapter
 * that derives rows and hands them to the shared `<GanttChart>` — data (linked
 * tasks, their statuses) is injected so the same view serves the authenticated
 * board (with task markers) and the public share page (bars only).
 *
 * **Nothing here is drawn from a date nobody set.** Items and tasks follow one
 * rule: both dates → a bar, one date → a diamond on it, neither → the row is
 * listed but not placed. A chart that invents a window is worse than a chart
 * with a gap in it — the gap is the true answer to "when is this happening?",
 * and it's the one that makes someone go and schedule the thing.
 *
 *   • item bar — its own `startDate` → `endDate`, filled to `progress`. An item
 *     that never set them falls back to `startedAt`/`completedAt`, which are
 *     facts it recorded about itself, and to nothing else.
 *   • task — a solid bar across its own start → end, exactly like the issue
 *     timeline draws it.
 *
 * Colours are reused, not invented: the item bar takes the "Now" column colour,
 * task bars/markers take their team-status colour.
 */
export function RoadmapGantt({
  items,
  columns,
  epics = [],
  groupByEpic = false,
  onOpenItem,
  tasksByItem,
  taskStatus,
  taskHref,
  onOpenTask,
  onTaskDatesChange,
  onItemDatesChange,
  isLoading,
}: RoadmapGanttProps) {
  // Which epic rows are folded shut. Presentational + per-session, like the
  // board's lanes and the table's groups.
  const [foldedEpics, setFoldedEpics] = useState<Set<string>>(() => new Set());
  const toggleEpic = (key: string) =>
    setFoldedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // The "Now" column — by key, falling back to the leftmost (most-immediate) one.
  const nowCol = columns.find((c) => c.key === 'now') ?? columns[0];
  const barColor = nowCol?.color ?? 'hsl(var(--primary))';
  const nowItems = nowCol ? items.filter((i) => i.phase === nowCol.key) : [];

  const grouped = groupByEpic && epics.length > 0;
  // Only epics with something *on this chart* get a row — an epic whose work
  // isn't in "Now" has nothing to draw, and its dates would be a claim about
  // rows the reader can't see.
  const groups = grouped
    ? epicLanes(epics, nowItems).filter((lane) => lane.items.length)
    : [{ key: '', label: '', color: '', items: nowItems, rollup: null }];

  const rows: GanttRow[] = [];
  for (const group of groups) {
    const folded = foldedEpics.has(group.key);
    if (group.rollup) {
      // The epic's own bar is the union of its items' windows and the mean of
      // their progress — read off the rows below it, never stored. Same rule as
      // an item: no dates in the group, no bar for the group.
      //
      // Deliberately no `onChange`: dragging a group would have to spread the
      // change over its items, and there is no honest way to decide how.
      const head: GanttRow = {
        id: `epic:${group.key}`,
        heading: true,
        collapsed: folded,
        dotColor: group.color,
        label: group.label,
        sublabel: `${group.rollup.progress}% · ${epicCountLabel(group.rollup)}`,
        onClick: () => toggleEpic(group.key),
        ...placeOnAxis({
          start: toEpoch(group.rollup.startDate),
          end: toEpoch(group.rollup.endDate),
          color: group.color,
          progress: group.rollup.progress,
          label: group.label,
        }),
      };
      rows.push(head);
      if (folded) continue;
    }
    for (const item of group.items) {
      const tasks = (tasksByItem?.get(item.id) ?? []).slice().sort(byIssueDate);
      const label = item.title || t('roadmaps.untitled');
      rows.push({
        id: item.id,
        label,
        sublabel: `${item.progress}% · ${
          tasks.length
            ? t('roadmaps.ganttTasks').replace('{count}', String(tasks.length))
            : t('roadmaps.ganttNoTasks')
        }`,
        onClick: () => onOpenItem(item.id),
        ...placeOnAxis({
          ...itemWindow(item),
          color: barColor,
          progress: item.progress,
          label,
          onChange: onItemDatesChange && ((next) => onItemDatesChange(item, next)),
        }),
      });

      for (const tk of tasks) {
        const st = taskStatus?.(tk) ?? { color: 'hsl(var(--muted-foreground))', label: tk.status };
        rows.push({
          id: `${item.id}:${tk.id}`,
          depth: 1,
          dotColor: st.color,
          label: tk.title,
          // A peek drawer when one is offered (it carries its own full-page link),
          // else a plain link to the detail — the public view's only option.
          ...(onOpenTask ? { onClick: () => onOpenTask(tk) } : { href: taskHref?.(tk) }),
          // No `progress`: a task bar is a schedule, not a fill level — the same
          // solid block the issue timeline draws for the same two dates.
          ...placeOnAxis({
            start: issueStart(tk),
            end: issueEnd(tk),
            color: st.color,
            label: tk.title,
            suffix: st.label,
            onChange: onTaskDatesChange && ((next) => onTaskDatesChange(tk, next)),
          }),
        });
      }
    }
  }

  // Every legend line is earned by something actually on the chart. Item bars used
  // to be guaranteed — now a roadmap of unscheduled items has none, and a key
  // explaining a bar you cannot see is just noise to read past.
  const hasItemBars = rows.some((r) => !r.heading && !(r.depth ?? 0) && r.bar);
  const hasTaskBars = rows.some((r) => (r.depth ?? 0) > 0 && r.bar);
  const hasMarkers = rows.some((r) => r.marker);

  return (
    <GanttChart
      rows={rows}
      isLoading={isLoading}
      labelHeader={t('roadmaps.item')}
      empty={{ title: t('roadmaps.ganttEmpty'), hint: t('roadmaps.ganttEmptyHint') }}
      legend={
        <>
          {hasItemBars && (
            <span className="flex items-center gap-1.5">
              {/* Two layers, like the bar itself: a translucent track with a fill —
                  so the swatch reads apart from a task's solid bar below it. */}
              <span className="relative h-2.5 w-6" aria-hidden>
                <span
                  className="absolute inset-0 rounded-full"
                  style={{ backgroundColor: barColor, opacity: 0.18 }}
                />
                <span
                  className="absolute inset-y-0 left-0 w-3 rounded-full"
                  style={{ backgroundColor: barColor }}
                />
              </span>
              {t('roadmaps.ganttLegendBar')}
            </span>
          )}
          {hasTaskBars && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-6 rounded-full bg-muted-foreground" aria-hidden />
              {t('roadmaps.ganttLegendTaskBar')}
            </span>
          )}
          {hasMarkers && (
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rotate-45 rounded-[2px] bg-muted-foreground" aria-hidden />
              {t('roadmaps.ganttLegendMarker')}
            </span>
          )}
          {/* Drag isn't discoverable on its own — say it, but only to someone who
              actually has an editable bar in front of them. */}
          {((hasItemBars && onItemDatesChange) || (hasTaskBars && onTaskDatesChange)) && (
            <span className="flex items-center gap-1.5">
              <MoveHorizontal className="size-3.5" aria-hidden />
              {t('roadmaps.ganttDragHint')}
            </span>
          )}
        </>
      }
    />
  );
}

interface RoadmapGanttViewProps {
  roadmapId: string;
  /** All roadmap items — filtered to the "Now" column by `RoadmapGantt`. */
  items: RoadmapItem[];
  columns: RoadmapColumn[];
  epics?: RoadmapEpic[];
  groupByEpic?: boolean;
}

/**
 * The authenticated roadmap timeline: fetches the roadmap's linked tasks once and
 * feeds them (plus their team-status colours and — for anyone who can write —
 * drag-to-reschedule) into `RoadmapGantt`, and owns the two peek drawers a row
 * opens. The public share page renders `RoadmapGantt` directly with no tasks, no
 * editing and links instead of drawers.
 *
 * Clicking a row **peeks** rather than navigating: leaving the chart to read one
 * item and coming back loses your place on the axis, and the whole point of a
 * timeline is the rows around the one you're looking at.
 */
export function RoadmapGanttView({
  roadmapId,
  items,
  columns,
  epics,
  groupByEpic,
}: RoadmapGanttViewProps) {
  const { canWrite } = useAuth();
  const statusesFor = useTeamStatusesLookup();
  // One query for the whole roadmap; grouped under each item below.
  const { data, isLoading } = useTasks({ roadmapId: [roadmapId] });
  const update = useUpdateTask();
  const replaceItems = useReplaceRoadmapItems();
  // What a row click opens — one drawer per kind, only ever one of them at a time.
  const [taskPeek, setTaskPeek] = useState<IssuePeek | null>(null);
  const [itemPeek, setItemPeek] = useState<RoadmapItemPeek | null>(null);
  // Dates just dragged, applied over the fetched task until the refetch agrees:
  // the update isn't optimistic, so without this the bar would spring back to
  // where it started for the length of the round-trip.
  const [pending, setPending] = useState<Record<string, DateWindow>>({});

  const fetched = data?.items;
  useEffect(() => {
    if (!fetched) return;
    setPending((prev) => {
      if (!Object.keys(prev).length) return prev;
      const next = { ...prev };
      let settled = false;
      for (const tk of fetched) {
        const p = next[tk.id];
        if (p && tk.startDate === p.startDate && tk.endDate === p.endDate) {
          delete next[tk.id];
          settled = true;
        }
      }
      return settled ? next : prev;
    });
  }, [fetched]);

  const tasksByItem = new Map<string, TaskDto[]>();
  for (const raw of fetched ?? []) {
    if (!raw.roadmapItemId) continue;
    const p = pending[raw.id];
    const tk = p ? { ...raw, ...p } : raw;
    const arr = tasksByItem.get(tk.roadmapItemId) ?? [];
    arr.push(tk);
    tasksByItem.set(tk.roadmapItemId, arr);
  }

  const reschedule = (task: TaskDto, next: DateWindow) => {
    setPending((p) => ({ ...p, [task.id]: next }));
    update.mutate(
      { id: task.id, input: next },
      {
        onError: (err) => {
          // Drop back to the stored dates and say why — an unexplained snap-back
          // just reads as a broken timeline.
          setPending(({ [task.id]: _dropped, ...rest }) => rest);
          toast.error(t('roadmaps.ganttSaveFailed'), { description: err.message });
        },
      },
    );
  };

  /** An item's dates live in the roadmap's items array, which is written whole —
   *  the same optimistic replace the board's drag uses, so the bar stays where it
   *  was dropped and rolls back with its own toast if the write fails. */
  const rescheduleItem = (item: RoadmapItem, next: DateWindow) =>
    replaceItems.mutate({
      id: roadmapId,
      items: items.map((i) => (i.id === item.id ? { ...i, ...next } : i)),
    });

  return (
    <>
      <RoadmapGantt
        items={items}
        columns={columns}
        epics={epics}
        groupByEpic={groupByEpic}
        onOpenItem={(id) => {
          const it = items.find((i) => i.id === id);
          setItemPeek({
            roadmapId,
            itemId: id,
            href: `/roadmaps/${roadmapId}/items/${it?.shortId || id}`,
          });
        }}
        tasksByItem={tasksByItem}
        isLoading={isLoading}
        taskStatus={(tk) => {
          // Every row here is a task: the query above is `useTasks`, which is bound
          // to `kind: task`, so the status comes from the team's *task* columns.
          const cfg = statusesFor(tk.teamId, TeamIssueType.TASK).find((c) => c.key === tk.status);
          return {
            color: cfg?.color ?? 'hsl(var(--muted-foreground))',
            label: cfg?.label ?? tk.status,
          };
        }}
        onOpenTask={(tk) =>
          setTaskPeek({
            id: tk.id,
            issueType: TeamIssueType.TASK,
            href: `/issues/${tk.shortId || tk.id}`,
          })
        }
        onTaskDatesChange={canWrite ? reschedule : undefined}
        onItemDatesChange={canWrite ? rescheduleItem : undefined}
      />

      <IssuePeekDrawer peek={taskPeek} onClose={() => setTaskPeek(null)} />
      <RoadmapItemPeekDrawer peek={itemPeek} onClose={() => setItemPeek(null)} />
    </>
  );
}
