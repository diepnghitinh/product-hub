import { useEffect, useState } from 'react';
import { MoveHorizontal, Target } from 'lucide-react';
import { toast } from 'sonner';
import { t } from '@/i18n';
import { formatDate } from '@/lib/format';
import { AssigneeBadge } from '@/components/AssigneeBadge';
import {
  GanttChart,
  GanttChip,
  GANTT_DAY,
  firstEpoch,
  isEpoch,
  toEpoch,
  type GanttRow,
} from '@/components/GanttChart';
import { LabelChips } from '@/features/labels/LabelChips';
import { CycleIcon } from '@/features/cycles/CycleIcon';
import { TeamChip, type TeamChipTeam } from '@/features/teams/TeamChip';
import { useTasks, useUpdateTask } from '@/features/tasks/api';
import { useTeamLabelsLookup, useTeamLookup, useTeamStatusesLookup } from '@/features/teams/api';
import { doneKeyOf } from '@/features/my-team/workload';
import { useAuth } from '@/lib/auth';
import {
  CycleStatus,
  ROADMAP_ITEM_STATUS_COLOR,
  ROADMAP_ITEM_STATUS_LABEL,
  TeamIssueType,
  type TaskLabelConfig,
} from '@/types/enums';
import type { RoadmapColumn, RoadmapItem, TaskDto } from '@/types/dto';
import { useReplaceRoadmapItems } from '../api';
import {
  sprintChipLabel,
  useRoadmapSprints,
  type RoadmapSprint,
  type SprintScope,
} from '../useRoadmapSprints';
import { IssuePeekDrawer, type IssuePeek } from '@/features/issues/IssuePeekDrawer';
import { RoadmapItemPeekDrawer, type RoadmapItemPeek } from './RoadmapItemPeekDrawer';

/** The window a bar was dragged to, in the ISO day shape the API stores. The same
 *  two fields on a task and on a backlog item, so one drag handler shape serves both. */
export interface DateWindow {
  startDate: string;
  endDate: string;
}

/** Epoch ms back to an ISO day. `toEpoch` reads `YYYY-MM-DD` as UTC midnight and
 *  a drag only ever adds whole days, so this round-trips exactly. */
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** A linked task's window. `endDate` is the truth; `dueDate` is its legacy
 *  server-synced mirror, kept as a fallback for rows saved before the rename. */
const taskStart = (tk: TaskDto) => toEpoch(tk.startDate);
const taskEnd = (tk: TaskDto) => firstEpoch(tk.endDate, tk.dueDate);

/** The date a task sits at — its start, else its end. */
function taskAnchor(tk: TaskDto) {
  const s = taskStart(tk);
  return isEpoch(s) ? s : taskEnd(tk);
}

/** Dated tasks first (soonest at top), undated last. */
function byDate(a: TaskDto, b: TaskDto) {
  const da = taskAnchor(a);
  const db = taskAnchor(b);
  if (isEpoch(da) && isEpoch(db)) return da - db;
  return isEpoch(da) ? -1 : isEpoch(db) ? 1 : 0;
}

interface RoadmapGanttProps {
  /** All roadmap items — filtered to the "Now" column here unless a sprint scope
   *  has already narrowed them (see {@link RoadmapGanttProps.scope}). */
  items: RoadmapItem[];
  columns: RoadmapColumn[];
  onOpenItem: (id: string) => void;
  /**
   * The roadmap's sprints, drawn as **named bands on the axis** — the answer to
   * "which sprint is this bar in?" without reading a single date. Omit (public
   * view) and the axis is the plain date ruler it has always been.
   */
  sprints?: RoadmapSprint[];
  /** The scope in effect. Its sprint is the highlighted band, and a scoped
   *  timeline charts **every** column rather than just "Now": the filter has
   *  already picked the committed work, and half of it routinely sits in Next. */
  scope?: SprintScope;
  /** Stack rows under a section header per sprint instead of one flat list — the
   *  "what did that sprint build?" reading of the same data. */
  groupBySprint?: boolean;
  /** An item's sprints (derived from its tasks) — for its chip and its group. */
  sprintsForItem?: (itemId: string) => RoadmapSprint[];
  /** A task's sprint — for its chip, and for splitting an item that spans two. */
  sprintForTask?: (task: TaskDto) => RoadmapSprint | undefined;
  /** Is this task finished on its own team's board? Only used for a sprint
   *  group's "N items · 6/9 tasks done" header. */
  taskDone?: (task: TaskDto) => boolean;
  /**
   * Tasks linked to each item, keyed by `roadmapItemId`. Omit (public views) to
   * render item bars only — no child markers, no authenticated task fetch.
   */
  tasksByItem?: Map<string, TaskDto[]>;
  /** Marker colour + label for a linked task; only consulted when `tasksByItem` has rows. */
  taskStatus?: (task: TaskDto) => { color: string; label: string };
  /** The task's team labels, for its chips. Injected like `taskStatus` so the
   *  public view renders no label chips instead of firing an authed `/teams`. */
  taskLabels?: (task: TaskDto) => TaskLabelConfig[];
  /** The task's owning team, for its chip — a backlog item's tasks routinely span
   *  Design / Frontend / Backend, and the bar alone doesn't say which. Injected
   *  for the same reason as `taskLabels`. */
  taskTeam?: (task: TaskDto) => TeamChipTeam | undefined;
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
   * so dragging writes them straight back; an item that has never been scheduled
   * by hand still shows the derived bar until it is dragged, and dragging is what
   * commits that window. Omit for the public view.
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
 * Bars are drawn from whatever dates exist:
 *   • item bar — from its start (startDate › startedAt › createdAt) to its own
 *     `endDate` when it has one, else derived: its completedAt, else the latest
 *     linked task's end date, else +2 weeks. Filled to `progress`.
 *   • task — a solid bar across its own start → end, exactly like the issue
 *     timeline draws it. A task with only one of the two dates falls back to a
 *     diamond on that date; one with neither is listed but not placed.
 *
 * Colours are reused, not invented: the item bar takes the "Now" column colour,
 * task bars/markers take their team-status colour.
 */
export function RoadmapGantt({
  items,
  columns,
  onOpenItem,
  sprints,
  scope,
  groupBySprint,
  sprintsForItem,
  sprintForTask,
  taskDone,
  tasksByItem,
  taskStatus,
  taskLabels,
  taskTeam,
  taskHref,
  onOpenTask,
  onTaskDatesChange,
  onItemDatesChange,
  isLoading,
}: RoadmapGanttProps) {
  // The "Now" column — by key, falling back to the leftmost (most-immediate) one.
  const nowCol = columns.find((c) => c.key === 'now') ?? columns[0];
  const barColor = nowCol?.color ?? 'hsl(var(--primary))';
  // Once the timeline reaches past "Now", an item's bar takes **its own** column's
  // colour — a Later item drawn in the Now colour would misreport its commitment.
  const colorOf = (phase: string) => columns.find((c) => c.key === phase)?.color ?? barColor;
  const narrowed = !!groupBySprint || (!!scope && scope.kind !== 'all');
  const shown = narrowed ? items : nowCol ? items.filter((i) => i.phase === nowCol.key) : [];
  const tasksOf = (item: RoadmapItem) => (tasksByItem?.get(item.id) ?? []).slice().sort(byDate);

  /** One item and its tasks, as rows. `keyPrefix` keeps ids unique when grouping
   *  puts the same item under two sprints. */
  function itemRows(item: RoadmapItem, tasks: TaskDto[], keyPrefix: string): GanttRow[] {
    const out: GanttRow[] = [];
    let start = firstEpoch(item.startDate, item.startedAt, item.createdAt);
    if (!isEpoch(start)) start = Date.now();
    // The item's own end wins when it has one — a window somebody set by hand (or
    // dragged) is intent, not a guess. Everything after it is the fallback chain.
    const ends = tasks.map(taskEnd).filter(isEpoch);
    let end = firstEpoch(item.endDate, item.completedAt);
    if (!isEpoch(end)) end = ends.length ? Math.max(...ends) : start + 14 * GANTT_DAY;
    if (end < start) end = start + GANTT_DAY; // guard odd data (e.g. an end before the start)

    const itemSprints = sprintsForItem?.(item.id) ?? [];
    const itemRow: GanttRow = {
      id: `${keyPrefix}${item.id}`,
      label: item.title || t('roadmaps.untitled'),
      sublabel: `${item.progress}% · ${
        tasks.length
          ? t('roadmaps.ganttTasks').replace('{count}', String(tasks.length))
          : t('roadmaps.ganttNoTasks')
      }`,
      // The card's chips, minus the ones a timeline already answers: no age (the
      // axis shows it) and no difficulty (a planning axis, not a schedule one).
      // RICE and the linked OKR stay — they're *why* this item is in "Now".
      meta: (
        <>
          {/* Its sprints, from its tasks. Redundant with the bands when the item
              sits in one sprint — and exactly what you need when it spans two,
              where the bar crosses a boundary and the span is the whole story.
              Suppressed inside a group, whose header already says which sprint. */}
          {!groupBySprint && itemSprints.length > 0 && (
            <GanttChip title={itemSprints.map((s) => s.label).join(' · ')}>
              {sprintChipLabel(itemSprints)}
            </GanttChip>
          )}
          <GanttChip color={ROADMAP_ITEM_STATUS_COLOR[item.status]}>
            {ROADMAP_ITEM_STATUS_LABEL[item.status]}
          </GanttChip>
          <GanttChip title="RICE score">
            <span className="font-mono">{item.rice}</span>
          </GanttChip>
          {item.okrLabel && (
            <GanttChip
              title={item.okrLabel}
              icon={<Target className="size-3 shrink-0 text-primary" aria-hidden />}
            >
              {item.okrLabel}
            </GanttChip>
          )}
          {item.assignees.length > 0 && (
            <AssigneeBadge
              assignees={item.assignees}
              unassignedLabel={t('tasks.unassigned')}
              className="max-w-[160px] py-0 text-[11px] font-medium"
            />
          )}
        </>
      ),
      onClick: () => onOpenItem(item.id),
      bar: { start, end, color: colorOf(item.phase), progress: item.progress },
    };
    // Dragging an item's bar commits the window it's showing — including a derived
    // one, which is the point: the derived bar is the proposal, the drag accepts it.
    if (onItemDatesChange) {
      itemRow.onBarChange = (n) =>
        onItemDatesChange(item, { startDate: isoDay(n.start), endDate: isoDay(n.end) });
    }
    out.push(itemRow);

    for (const tk of tasks) {
      const st = taskStatus?.(tk) ?? { color: 'hsl(var(--muted-foreground))', label: tk.status };
      const s = taskStart(tk);
      const e = taskEnd(tk);
      const tkSprint = sprintForTask?.(tk);
      const row: GanttRow = {
        id: `${keyPrefix}${item.id}:${tk.id}`,
        depth: 1,
        dotColor: st.color,
        label: tk.title,
        // Same chips a task carries on the issue timeline, so a linked task reads
        // the same wherever it's charted.
        meta: (
          <>
            {tk.shortId && (
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{tk.shortId}</span>
            )}
            {/* Always named here, even when today's tasks happen to share a team:
                a roadmap isn't a team's board, so "which space is doing this" is
                never implied by the page around it. */}
            <TeamChip team={taskTeam?.(tk)} />
            <GanttChip color={st.color}>{st.label}</GanttChip>
            {/* The commitment itself: a task *is* in one sprint (unlike its item,
                which only inherits them). Inside a group that's a given, so the
                chip only appears in the flat reading. */}
            {!groupBySprint && tkSprint && <GanttChip title={tkSprint.label}>{tkSprint.name}</GanttChip>}
            <LabelChips keys={tk.labelKeys} labels={taskLabels?.(tk)} max={2} />
            {tk.assignees.length > 0 && (
              <AssigneeBadge
                assignees={tk.assignees}
                unassignedLabel={t('tasks.unassigned')}
                className="max-w-[160px] py-0 text-[11px] font-medium"
              />
            )}
          </>
        ),
        // A peek drawer when one is offered (it carries its own full-page link),
        // else a plain link to the detail — the public view's only option.
        ...(onOpenTask ? { onClick: () => onOpenTask(tk) } : { href: taskHref?.(tk) }),
      };
      if (isEpoch(s) && isEpoch(e)) {
        // No `progress`: a task bar is a schedule, not a fill level — the same
        // solid block the issue timeline draws for the same two dates.
        const range = `${formatDate(new Date(s))} – ${formatDate(new Date(e))}`;
        row.bar = { start: s, end: e, color: st.color, tooltip: `${tk.title} · ${range} · ${st.label}` };
        // Only a task that already has both dates can be rescheduled by drag —
        // a single-date task is a diamond, and there's no window to move.
        if (onTaskDatesChange) {
          row.onBarChange = (n) =>
            onTaskDatesChange(tk, { startDate: isoDay(n.start), endDate: isoDay(n.end) });
        }
      } else if (isEpoch(e)) {
        const when = t('roadmaps.ganttDue').replace('{date}', formatDate(new Date(e)));
        row.marker = { at: e, color: st.color, tooltip: `${tk.title} · ${when} · ${st.label}` };
      } else if (isEpoch(s)) {
        const when = t('roadmaps.ganttStarts').replace('{date}', formatDate(new Date(s)));
        row.marker = { at: s, color: st.color, tooltip: `${tk.title} · ${when} · ${st.label}` };
      } else {
        row.emptyText = t('roadmaps.ganttNoDates');
      }
      out.push(row);
    }
    return out;
  }

  /** A sprint's section header: what it is, when it ran, and what it holds. */
  function groupHeader(name: string, range: string, groupItems: RoadmapItem[], groupTasks: TaskDto[]) {
    const done = taskDone ? groupTasks.filter(taskDone).length : 0;
    return (
      <>
        <CycleIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="whitespace-nowrap text-sm font-semibold text-foreground">{name}</span>
        {range && <span className="whitespace-nowrap text-xs text-muted-foreground">{range}</span>}
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {taskDone
            ? t('sprints.groupSummary')
                .replace('{items}', String(groupItems.length))
                .replace('{done}', String(done))
                .replace('{tasks}', String(groupTasks.length))
            : `${groupItems.length} · ${groupTasks.length}`}
        </span>
      </>
    );
  }

  const rows: GanttRow[] = [];
  if (groupBySprint) {
    // Newest sprint first — the one you're in leads, and scrolling down walks back
    // through what shipped. Each sprint shows only the tasks **committed to it**,
    // so an item spanning two sprints appears under both, each time with just that
    // sprint's slice of the work. That split is the whole answer to "what did that
    // sprint build?" — one row per item would blur the two together.
    for (const sprint of sprints ?? []) {
      const groupItems = shown.filter((i) =>
        (sprintsForItem?.(i.id) ?? []).some((s) => s.key === sprint.key),
      );
      if (groupItems.length === 0) continue;
      const slices = groupItems.map((i) => ({
        item: i,
        tasks: tasksOf(i).filter((tk) => sprintForTask?.(tk)?.key === sprint.key),
      }));
      rows.push({
        id: `group:${sprint.key}`,
        label: sprint.name,
        group: groupHeader(
          sprint.name,
          `${formatDate(new Date(toEpoch(sprint.startDate)))} – ${formatDate(new Date(toEpoch(sprint.endDate)))}`,
          groupItems,
          slices.flatMap((s) => s.tasks),
        ),
      });
      for (const { item, tasks } of slices) rows.push(...itemRows(item, tasks, `${sprint.key}:`));
    }
    // Trailing, because it's the leftovers — items whose work nobody has put in a
    // sprint yet. Named rather than merged into the last one, so a planning gap is
    // a thing you see instead of a thing you deduce.
    const loose = shown.filter((i) => (sprintsForItem?.(i.id) ?? []).length === 0);
    if (loose.length > 0) {
      const slices = loose.map((i) => ({ item: i, tasks: tasksOf(i) }));
      rows.push({
        id: 'group:none',
        label: t('sprints.noSprintGroup'),
        group: groupHeader(t('sprints.noSprintGroup'), '', loose, slices.flatMap((s) => s.tasks)),
      });
      for (const { item, tasks } of slices) rows.push(...itemRows(item, tasks, 'none:'));
    }
  } else {
    for (const item of shown) rows.push(...itemRows(item, tasksOf(item), ''));
  }

  // Bands cover only the stretch the rows actually occupy (plus the scoped sprint,
  // which must always be visible). The chart widens its window to fit a band, so
  // handing it the roadmap's whole cycle history would zoom the axis out to months
  // of empty space either side of the work.
  const focusKey = scope?.kind === 'sprint' ? scope.sprint.key : undefined;
  const stamps: number[] = [];
  for (const r of rows) {
    if (r.bar) stamps.push(r.bar.start, r.bar.end);
    if (r.marker && isEpoch(r.marker.at)) stamps.push(r.marker.at);
  }
  const lo = stamps.length ? Math.min(...stamps) : Date.now();
  const hi = stamps.length ? Math.max(...stamps) : Date.now();
  const bands = (sprints ?? [])
    .filter(
      (s) =>
        s.key === focusKey || (toEpoch(s.endDate) >= lo && toEpoch(s.startDate) <= hi),
    )
    .map((s) => ({
      key: s.key,
      start: toEpoch(s.startDate),
      // A cycle's end date is inclusive of that day; the axis is continuous, so
      // the band has to run to the end of it or it stops 24 hours short.
      end: toEpoch(s.endDate) + GANTT_DAY,
      label: s.name,
      title: s.label,
      tone:
        s.key === focusKey
          ? ('focus' as const)
          : s.status === CycleStatus.ACTIVE
            ? ('active' as const)
            : ('default' as const),
    }));

  const hasTaskBars = rows.some((r) => (r.depth ?? 0) > 0 && r.bar);
  const hasMarkers = rows.some((r) => r.marker);

  return (
    <GanttChart
      rows={rows}
      bands={bands}
      isLoading={isLoading}
      // A backlog item's tasks fold away under it: a cycle routinely charts 15
      // items and 60 tasks, and folded is the "which item lands when?" reading.
      collapsible
      labelHeader={t('roadmaps.item')}
      empty={{ title: t('roadmaps.ganttEmpty'), hint: t('roadmaps.ganttEmptyHint') }}
      legend={
        <>
          {bands.length > 0 && !groupBySprint && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-6 rounded-sm bg-muted-foreground/25" aria-hidden />
              {t('sprints.axisHint')}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            {/* Two layers, like the bar itself: a translucent track with a fill —
                so the swatch reads apart from a task's solid bar below it. */}
            <span className="relative h-2.5 w-6" aria-hidden>
              <span className="absolute inset-0 rounded-full" style={{ backgroundColor: barColor, opacity: 0.18 }} />
              <span className="absolute inset-y-0 left-0 w-3 rounded-full" style={{ backgroundColor: barColor }} />
            </span>
            {t('roadmaps.ganttLegendBar')}
          </span>
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
          {(onItemDatesChange || (hasTaskBars && onTaskDatesChange)) && (
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
  /** The items in scope — narrowed to the "Now" column by `RoadmapGantt` unless a
   *  sprint scope has already picked them. */
  items: RoadmapItem[];
  /**
   * The roadmap's **whole** items array. Dragging a bar rewrites that array in
   * one PUT, so the write has to start from every item — building it from the
   * sprint-filtered `items` would silently delete everything out of scope.
   */
  allItems: RoadmapItem[];
  columns: RoadmapColumn[];
  /** The roadmap's sprints and the scope in effect, from the page's `?sprint=`. */
  sprints: RoadmapSprint[];
  scope: SprintScope;
  groupBySprint: boolean;
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
  allItems,
  columns,
  sprints,
  scope,
  groupBySprint,
}: RoadmapGanttViewProps) {
  const { canWrite } = useAuth();
  const statusesFor = useTeamStatusesLookup();
  const labelsFor = useTeamLabelsLookup();
  const teamFor = useTeamLookup();
  // One query for the whole roadmap; grouped under each item below.
  const { data, isLoading } = useTasks({ roadmapId: [roadmapId] });
  // The same hook the page uses, so this reads from the shared cache rather than
  // refetching — it's here only for the per-task lookup, which the page has no
  // use for and would otherwise have to thread through as two more props.
  const { sprintsForItem, sprintForTask } = useRoadmapSprints(roadmapId);
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
      // Over `allItems`, never the charted subset — see the prop's note.
      items: allItems.map((i) => (i.id === item.id ? { ...i, ...next } : i)),
    });

  return (
    <>
      <RoadmapGantt
        items={items}
        columns={columns}
        sprints={sprints}
        scope={scope}
        groupBySprint={groupBySprint}
        sprintsForItem={sprintsForItem}
        sprintForTask={sprintForTask}
        // Same "done" the boards and the sprint banner use, so a group header
        // can't disagree with the strip above it about what shipped.
        taskDone={(tk) => tk.status === doneKeyOf(statusesFor(tk.teamId, TeamIssueType.TASK))}
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
          return { color: cfg?.color ?? 'hsl(var(--muted-foreground))', label: cfg?.label ?? tk.status };
        }}
        taskLabels={(tk) => labelsFor(tk.teamId)}
        taskTeam={(tk) => teamFor(tk.teamId)}
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
