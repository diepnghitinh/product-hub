import { t } from '@/i18n';
import { formatDate } from '@/lib/format';
import { GanttChart, GANTT_DAY, firstEpoch, isEpoch, toEpoch, type GanttRow } from '@/components/GanttChart';
import { useTasks } from '@/features/tasks/api';
import { useTeamStatusesLookup } from '@/features/teams/api';
import { TeamIssueType } from '@/types/enums';
import type { RoadmapColumn, RoadmapItem, TaskDto } from '@/types/dto';

/** Dated tasks first (soonest due at top), undated last. */
function byDue(a: TaskDto, b: TaskDto) {
  const da = toEpoch(a.dueDate);
  const db = toEpoch(b.dueDate);
  if (isEpoch(da) && isEpoch(db)) return da - db;
  return isEpoch(da) ? -1 : isEpoch(db) ? 1 : 0;
}

interface RoadmapGanttViewProps {
  roadmapId: string;
  /** All roadmap items — filtered to the "Now" column here. */
  items: RoadmapItem[];
  columns: RoadmapColumn[];
  onOpenItem: (id: string) => void;
}

/**
 * Timeline (Gantt) for a roadmap's committed work: the "Now" column's items,
 * each grouped with the tasks linked to it (`roadmapItemId`). A thin adapter that
 * derives rows and hands them to the shared `<GanttChart>`.
 *
 * Neither shape carries both endpoints, so bars are derived from what exists:
 *   • item bar — from its start (startDate › startedAt › createdAt) to the
 *     latest linked task's due date (or its own completedAt, or +2 weeks when
 *     nothing anchors the end), filled to `progress`.
 *   • task — a diamond marker on its due date (undated tasks are listed but not
 *     placed). Colour + label come from the task's own team status config.
 *
 * Colours are reused, not invented: the item bar takes the "Now" column colour,
 * task markers take their team-status colour.
 */
export function RoadmapGanttView({ roadmapId, items, columns, onOpenItem }: RoadmapGanttViewProps) {
  const statusesFor = useTeamStatusesLookup();
  // One query for the whole roadmap; grouped under each item below.
  const { data, isLoading } = useTasks({ roadmapId: [roadmapId] });

  // The "Now" column — by key, falling back to the leftmost (most-immediate) one.
  const nowCol = columns.find((c) => c.key === 'now') ?? columns[0];
  const barColor = nowCol?.color ?? 'hsl(var(--primary))';
  const nowItems = nowCol ? items.filter((i) => i.phase === nowCol.key) : [];

  const tasksByItem = new Map<string, TaskDto[]>();
  for (const tk of data?.items ?? []) {
    if (!tk.roadmapItemId) continue;
    const arr = tasksByItem.get(tk.roadmapItemId) ?? [];
    arr.push(tk);
    tasksByItem.set(tk.roadmapItemId, arr);
  }

  const rows: GanttRow[] = [];
  for (const item of nowItems) {
    const tasks = (tasksByItem.get(item.id) ?? []).slice().sort(byDue);
    let start = firstEpoch(item.startDate, item.startedAt, item.createdAt);
    if (!isEpoch(start)) start = Date.now();
    const dues = tasks.map((tk) => toEpoch(tk.dueDate)).filter(isEpoch);
    const completed = toEpoch(item.completedAt);
    let end = isEpoch(completed) ? completed : dues.length ? Math.max(...dues) : start + 14 * GANTT_DAY;
    if (end < start) end = start + GANTT_DAY; // guard odd data (e.g. a due before start)

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
      const due = toEpoch(tk.dueDate);
      const cfg = statusesFor(tk.teamId, TeamIssueType.TASK).find((c) => c.key === tk.status);
      const color = cfg?.color ?? 'hsl(var(--muted-foreground))';
      const label = cfg?.label ?? tk.status;
      rows.push({
        id: `${item.id}:${tk.id}`,
        depth: 1,
        dotColor: color,
        label: tk.title,
        href: `/tasks/${tk.shortId || tk.id}`,
        marker: isEpoch(due)
          ? {
              at: due,
              color,
              tooltip: `${tk.title} · ${t('roadmaps.ganttDue').replace('{date}', formatDate(new Date(due)))} · ${label}`,
            }
          : undefined,
        emptyText: isEpoch(due) ? undefined : t('roadmaps.ganttNoDue'),
      });
    }
  }

  return (
    <GanttChart
      rows={rows}
      isLoading={isLoading}
      labelHeader={t('roadmaps.item')}
      empty={{ title: t('roadmaps.ganttEmpty'), hint: t('roadmaps.ganttEmptyHint') }}
      legend={
        <>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-6 rounded-full" style={{ backgroundColor: barColor }} aria-hidden />
            {t('roadmaps.ganttLegendBar')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rotate-45 rounded-[2px] bg-muted-foreground" aria-hidden />
            {t('roadmaps.ganttLegendMarker')}
          </span>
        </>
      }
    />
  );
}
