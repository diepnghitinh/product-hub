import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { t } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useTasks } from '@/features/tasks/api';
import { useTeamStatusesLookup } from '@/features/teams/api';
import { TeamIssueType } from '@/types/enums';
import type { RoadmapColumn, RoadmapItem, TaskDto } from '@/types/dto';

const DAY = 86_400_000;
/** Width of the fixed left label rail; the timeline fills the rest. Kept as a
 *  literal so the gridline overlay (`left-[200px]`) and the grid columns match. */
const LABEL_W = 200;

const ms = (d?: string) => (d ? new Date(d).getTime() : NaN);
const ok = (n: number) => !Number.isNaN(n);
/** First of the given ISO dates that's actually set, as epoch ms — or NaN. */
function firstMs(...dates: (string | undefined)[]): number {
  for (const d of dates) {
    const m = ms(d);
    if (ok(m)) return m;
  }
  return NaN;
}
/** Dated tasks first (soonest due at top), undated last. */
function byDue(a: TaskDto, b: TaskDto) {
  const da = ms(a.dueDate);
  const db = ms(b.dueDate);
  if (ok(da) && ok(db)) return da - db;
  return ok(da) ? -1 : ok(db) ? 1 : 0;
}

interface Tick {
  x: number;
  label: string;
}

/** Axis ticks across the padded window: weekly for short spans, monthly for long
 *  ones — keeps the header readable whether "Now" is two weeks or two quarters. */
function buildTicks(minMs: number, maxMs: number): Tick[] {
  const pct = (v: number) => ((v - minMs) / (maxMs - minMs)) * 100;
  const ticks: Tick[] = [];
  const spanDays = (maxMs - minMs) / DAY;
  if (spanDays <= 70) {
    const c = new Date(minMs);
    c.setHours(0, 0, 0, 0);
    if (c.getTime() < minMs) c.setDate(c.getDate() + 1);
    for (let d = c.getTime(); d <= maxMs; d += 7 * DAY) {
      ticks.push({ x: pct(d), label: new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) });
    }
  } else {
    const c = new Date(minMs);
    c.setDate(1);
    c.setHours(0, 0, 0, 0);
    if (c.getTime() < minMs) c.setMonth(c.getMonth() + 1);
    while (c.getTime() <= maxMs) {
      ticks.push({ x: pct(c.getTime()), label: c.toLocaleDateString(undefined, { month: 'short' }) });
      c.setMonth(c.getMonth() + 1);
    }
  }
  return ticks;
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
 * each grouped with the tasks linked to it (`roadmapItemId`).
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

  const rows = nowItems.map((item) => {
    const tasks = (tasksByItem.get(item.id) ?? []).slice().sort(byDue);
    let start = firstMs(item.startDate, item.startedAt, item.createdAt);
    if (!ok(start)) start = Date.now();
    const dues = tasks.map((tk) => ms(tk.dueDate)).filter(ok);
    const completed = ms(item.completedAt);
    let end = ok(completed) ? completed : dues.length ? Math.max(...dues) : start + 14 * DAY;
    if (end < start) end = start + DAY; // guard odd data (e.g. a due before start)
    return { item, tasks, start, end };
  });

  if (isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-sm font-medium text-foreground">{t('roadmaps.ganttEmpty')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('roadmaps.ganttEmptyHint')}</p>
      </div>
    );
  }

  // Padded window covering every endpoint plus today, so the "today" line always lands.
  const stamps = [Date.now()];
  for (const r of rows) {
    stamps.push(r.start, r.end);
    for (const tk of r.tasks) {
      const d = ms(tk.dueDate);
      if (ok(d)) stamps.push(d);
    }
  }
  let minMs = Math.min(...stamps);
  let maxMs = Math.max(...stamps);
  if (maxMs - minMs < 14 * DAY) maxMs = minMs + 14 * DAY; // never a hairline axis
  const pad = Math.max(2 * DAY, (maxMs - minMs) * 0.05);
  minMs -= pad;
  maxMs += pad;

  const pct = (v: number) => Math.min(100, Math.max(0, ((v - minMs) / (maxMs - minMs)) * 100));
  const ticks = buildTicks(minMs, maxMs);
  const todayX = pct(Date.now());

  return (
    <div className="flex flex-col gap-3">
      {/* Legend — what a bar and a diamond mean, so the derived timeline reads clearly. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-6 rounded-full" style={{ backgroundColor: barColor }} aria-hidden />
          {t('roadmaps.ganttLegendBar')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rotate-45 rounded-[2px] bg-muted-foreground" aria-hidden />
          {t('roadmaps.ganttLegendMarker')}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <div className="min-w-[760px]">
          {/* Axis header */}
          <div className="grid grid-cols-[200px_1fr] border-b bg-muted/40">
            <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('roadmaps.item')}
            </div>
            <div className="relative h-8">
              {ticks.map((tk, i) => (
                <div
                  key={i}
                  className="absolute top-0 flex h-full items-center whitespace-nowrap px-1 text-[11px] tabular-nums text-muted-foreground"
                  style={{ left: `${tk.x}%` }}
                >
                  {tk.label}
                </div>
              ))}
              <div
                className="absolute top-0 -translate-x-1/2 rounded-b bg-foreground/80 px-1 text-[10px] font-medium text-background"
                style={{ left: `${todayX}%` }}
              >
                {t('roadmaps.ganttToday')}
              </div>
            </div>
          </div>

          {/* Body: gridlines + today line sit behind the rows. */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-[200px] right-0 z-0">
              {ticks.map((tk, i) => (
                <div key={i} className="absolute inset-y-0 w-px bg-border/70" style={{ left: `${tk.x}%` }} />
              ))}
              <div className="absolute inset-y-0 w-px bg-foreground/30" style={{ left: `${todayX}%` }} />
            </div>

            <div className="relative z-10">
              {rows.map(({ item, tasks, start, end }) => {
                const left = pct(start);
                const width = Math.max(1.5, pct(end) - left);
                return (
                  <div key={item.id}>
                    {/* Item row — title + derived summary bar. */}
                    <div className="grid grid-cols-[200px_1fr] items-center border-b hover:bg-accent/30">
                      <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => onOpenItem(item.id)}
                          className="truncate text-left text-sm font-medium text-foreground hover:underline"
                          title={item.title || t('roadmaps.untitled')}
                        >
                          {item.title || t('roadmaps.untitled')}
                        </button>
                        <span className="text-[11px] text-muted-foreground">
                          {item.progress}% ·{' '}
                          {tasks.length
                            ? t('roadmaps.ganttTasks').replace('{count}', String(tasks.length))
                            : t('roadmaps.ganttNoTasks')}
                        </span>
                      </div>
                      <div className="relative h-10">
                        {/* Track (item span) + progress fill on top. */}
                        <div
                          className="absolute top-1/2 h-4 -translate-y-1/2 rounded-md"
                          style={{ left: `${left}%`, width: `${width}%`, backgroundColor: barColor, opacity: 0.18 }}
                          title={`${formatDate(new Date(start))} – ${formatDate(new Date(end))}`}
                        />
                        <div
                          className="absolute top-1/2 h-4 -translate-y-1/2 rounded-md"
                          style={{ left: `${left}%`, width: `${(width * item.progress) / 100}%`, backgroundColor: barColor }}
                        />
                        {width > 12 && (
                          <span
                            className="absolute top-1/2 -translate-x-full -translate-y-1/2 pr-1.5 text-[10px] font-medium tabular-nums text-foreground/70"
                            style={{ left: `${left + width}%` }}
                          >
                            {item.progress}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Task rows — a due-date marker each, coloured by team status. */}
                    {tasks.map((tk) => {
                      const due = ms(tk.dueDate);
                      const cfg = statusesFor(tk.teamId, TeamIssueType.TASK).find((c) => c.key === tk.status);
                      const color = cfg?.color ?? 'hsl(var(--muted-foreground))';
                      const label = cfg?.label ?? tk.status;
                      return (
                        <div
                          key={tk.id}
                          className="grid grid-cols-[200px_1fr] items-center border-b last:border-0 hover:bg-accent/30"
                        >
                          <div className="flex min-w-0 items-center gap-2 py-1.5 pl-6 pr-3">
                            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                            <Link
                              to={`/tasks/${tk.shortId || tk.id}`}
                              className="min-w-0 flex-1 truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                              title={tk.title}
                            >
                              {tk.title}
                            </Link>
                          </div>
                          <div className="relative h-8">
                            {ok(due) ? (
                              <span
                                className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] ring-2 ring-card"
                                style={{ left: `${pct(due)}%`, backgroundColor: color }}
                                title={`${tk.title} · ${t('roadmaps.ganttDue').replace('{date}', formatDate(new Date(due)))} · ${label}`}
                              />
                            ) : (
                              <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] italic text-muted-foreground/70">
                                {t('roadmaps.ganttNoDue')}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
