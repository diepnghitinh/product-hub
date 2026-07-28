import { useEffect, useState } from 'react';
import { MoveHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { t } from '@/i18n';
import { formatDate } from '@/lib/format';
import { GanttChart, GANTT_DAY, firstEpoch, isEpoch, toEpoch, type GanttRow } from '@/components/GanttChart';
import { useTasks, useUpdateTask } from '@/features/tasks/api';
import { useTeamStatusesLookup } from '@/features/teams/api';
import { useAuth } from '@/lib/auth';
import { TeamIssueType } from '@/types/enums';
import type { RoadmapColumn, RoadmapItem, TaskDto } from '@/types/dto';

/** The window a task was dragged to, in the ISO day shape the API stores. */
export interface TaskDates {
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
  /** All roadmap items — filtered to the "Now" column here. */
  items: RoadmapItem[];
  columns: RoadmapColumn[];
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
  /**
   * Makes a linked task's bar **draggable** (moves the whole window) and
   * **resizable** (drag an edge to change just that date). Omit — public view,
   * or no write access — and the timeline is read-only. Only tasks are editable:
   * an item's bar has no end date of its own to write, it's derived from these.
   */
  onTaskDatesChange?: (task: TaskDto, next: TaskDates) => void;
  isLoading?: boolean;
}

/**
 * The presentational roadmap timeline: the "Now" column's items as bars, each
 * optionally grouped with the tasks linked to it (`roadmapItemId`). A thin adapter
 * that derives rows and hands them to the shared `<GanttChart>` — data (linked
 * tasks, their statuses) is injected so the same view serves the authenticated
 * board (with task markers) and the public share page (bars only).
 *
 * A roadmap item carries no end date of its own, so bars are derived from what exists:
 *   • item bar — from its start (startDate › startedAt › createdAt) to the
 *     latest linked task's end date (or its own completedAt, or +2 weeks when
 *     nothing anchors the end), filled to `progress`.
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
  tasksByItem,
  taskStatus,
  taskHref,
  onTaskDatesChange,
  isLoading,
}: RoadmapGanttProps) {
  // The "Now" column — by key, falling back to the leftmost (most-immediate) one.
  const nowCol = columns.find((c) => c.key === 'now') ?? columns[0];
  const barColor = nowCol?.color ?? 'hsl(var(--primary))';
  const nowItems = nowCol ? items.filter((i) => i.phase === nowCol.key) : [];

  const rows: GanttRow[] = [];
  for (const item of nowItems) {
    const tasks = (tasksByItem?.get(item.id) ?? []).slice().sort(byDate);
    let start = firstEpoch(item.startDate, item.startedAt, item.createdAt);
    if (!isEpoch(start)) start = Date.now();
    const ends = tasks.map(taskEnd).filter(isEpoch);
    const completed = toEpoch(item.completedAt);
    let end = isEpoch(completed) ? completed : ends.length ? Math.max(...ends) : start + 14 * GANTT_DAY;
    if (end < start) end = start + GANTT_DAY; // guard odd data (e.g. an end before the start)

    rows.push({
      id: item.id,
      label: item.title || t('roadmaps.untitled'),
      sublabel: `${item.progress}% · ${
        tasks.length
          ? t('roadmaps.ganttTasks').replace('{count}', String(tasks.length))
          : t('roadmaps.ganttNoTasks')
      }`,
      onClick: () => onOpenItem(item.id),
      bar: { start, end, color: barColor, progress: item.progress },
    });

    for (const tk of tasks) {
      const st = taskStatus?.(tk) ?? { color: 'hsl(var(--muted-foreground))', label: tk.status };
      const s = taskStart(tk);
      const e = taskEnd(tk);
      const row: GanttRow = {
        id: `${item.id}:${tk.id}`,
        depth: 1,
        dotColor: st.color,
        label: tk.title,
        href: taskHref?.(tk),
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
      rows.push(row);
    }
  }

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
          {hasTaskBars && onTaskDatesChange && (
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
  onOpenItem: (id: string) => void;
}

/**
 * The authenticated roadmap timeline: fetches the roadmap's linked tasks once and
 * feeds them (plus their team-status colours, detail links and — for anyone who
 * can write — drag-to-reschedule) into `RoadmapGantt`. The public share page
 * renders `RoadmapGantt` directly with no tasks and no editing.
 */
export function RoadmapGanttView({ roadmapId, items, columns, onOpenItem }: RoadmapGanttViewProps) {
  const { canWrite } = useAuth();
  const statusesFor = useTeamStatusesLookup();
  // One query for the whole roadmap; grouped under each item below.
  const { data, isLoading } = useTasks({ roadmapId: [roadmapId] });
  const update = useUpdateTask();
  // Dates just dragged, applied over the fetched task until the refetch agrees:
  // the update isn't optimistic, so without this the bar would spring back to
  // where it started for the length of the round-trip.
  const [pending, setPending] = useState<Record<string, TaskDates>>({});

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

  const reschedule = (task: TaskDto, next: TaskDates) => {
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

  return (
    <RoadmapGantt
      items={items}
      columns={columns}
      onOpenItem={onOpenItem}
      tasksByItem={tasksByItem}
      isLoading={isLoading}
      taskStatus={(tk) => {
        const cfg = statusesFor(tk.teamId, TeamIssueType.TASK).find((c) => c.key === tk.status);
        return { color: cfg?.color ?? 'hsl(var(--muted-foreground))', label: cfg?.label ?? tk.status };
      }}
      taskHref={(tk) => `/issues/${tk.shortId || tk.id}`}
      onTaskDatesChange={canWrite ? reschedule : undefined}
    />
  );
}
