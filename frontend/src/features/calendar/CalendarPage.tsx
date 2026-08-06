import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Lock,
  UserCheck,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { CalendarSkeleton } from '@/components/Skeletons';
import { IssueBoardLayout } from '@/components/IssueBoardLayout';
import { localeTag, t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useUpdateTask } from '@/features/tasks/api';
import { useTeams } from '@/features/teams/api';
import type { TaskDto } from '@/types/dto';
import { TaskStatus } from '@/types/enums';
import {
  CALENDAR_SOURCES,
  useCalendarTasks,
  useStatusColor,
  type CalendarSource,
  type CalendarTask,
} from './api';
import { buildLoad, isOverdue } from './workload';
import { CalendarDragBar, CalendarGrid, type CalendarWorkload } from './CalendarGrid';
import { DayPeekDialog, QuickAddDialog, UnscheduledDrawer } from './CalendarDialogs';
import {
  addDays,
  addMonths,
  monthWeeks,
  parseISO,
  rescheduleTo,
  startOfMonth,
  startOfWeek,
  taskSpan,
  todayISO,
  weekDays,
} from './model';

/** Bars per week before the month grid collapses the rest into "+N more". Three
 *  is what a month cell can hold and still leave the date legible; the week view
 *  has the room to show every one, so it passes no cap. */
const MONTH_MAX_LANES = 3;

/**
 * **Calendar** — your own work laid out on days, and a place to put more work on
 * one. It draws the two lists that are already yours (your private Personal
 * board and the team tasks assigned to you), so nothing here is a new source of
 * truth: change a date on the calendar and the boards agree instantly, because
 * it is the same task.
 *
 * Everything the page shows rides in the URL — the period, the view and which
 * sources are on — so a calendar you're looking at is a calendar you can send
 * someone, and the sidebar's Personal / Team rows are just those URLs.
 *
 * A task with no dates cannot be drawn on a grid of days. Rather than dropping
 * those silently, the toolbar counts them and the Unscheduled drawer is where
 * they get one.
 */
export function CalendarPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const view: 'month' | 'week' = searchParams.get('view') === 'week' ? 'week' : 'month';
  const isWeek = view === 'week';
  // The day the visible period is anchored on; absent = today, so a fresh visit
  // always lands on now.
  const anchor = searchParams.get('date') || todayISO();
  const period = isWeek ? startOfWeek(anchor) : startOfMonth(anchor);

  // Absent = both sources, which is the default and the shortest URL.
  const sourceParam = searchParams.get('source');
  const sources: CalendarSource[] = CALENDAR_SOURCES.includes(sourceParam as CalendarSource)
    ? [sourceParam as CalendarSource]
    : [...CALENDAR_SOURCES];

  function setParams(next: Partial<{ view: string; date: string; source: string }>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    setSearchParams(params, { replace: true });
  }

  const [search, setSearch] = useState('');
  const [quickAddDay, setQuickAddDay] = useState<string | null>(null);
  const [peekDay, setPeekDay] = useState<string | null>(null);
  const [unscheduledOpen, setUnscheduledOpen] = useState(false);
  const [dragging, setDragging] = useState<CalendarTask | null>(null);

  const { items, isLoading } = useCalendarTasks(sources);
  const colorOf = useStatusColor();
  const update = useUpdateTask();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (task) => task.title.toLowerCase().includes(q) || task.shortId.toLowerCase().includes(q),
    );
  }, [items, search]);

  const weeks = useMemo(() => (isWeek ? [weekDays(period)] : monthWeeks(period)), [isWeek, period]);

  /**
   * The workload layer is the **assigned** calendar's alone. A personal task
   * belongs to no team, carries no estimate and joins no cycle, so every chip
   * here would be blank on one — and the combined view mixes both, where a
   * points total that silently ignores half the bars would be worse than none.
   */
  const assignedOnly = sources.length === 1 && sources[0] === 'assigned';
  const { data: teams } = useTeams();

  const load = useMemo(
    () => (assignedOnly ? buildLoad(filtered, weeks.flat()) : null),
    [assignedOnly, filtered, weeks],
  );

  const workload = useMemo<CalendarWorkload | undefined>(() => {
    if (!load) return undefined;
    const byId = new Map((teams ?? []).map((team) => [team.id, team]));
    return {
      byDay: load.byDay,
      peak: load.peak,
      chipOf: (task) => {
        const team = byId.get(task.teamId);
        return {
          teamKey: team?.key ?? '',
          teamName: team?.name ?? '',
          points: task.estimate || 0,
          overdue: isOverdue(task),
        };
      },
    };
  }, [load, teams]);

  // Open work with no dates at all — done tasks don't count, since an undated
  // finished task isn't something waiting to be scheduled.
  const unscheduledCount = useMemo(
    () => items.filter((task) => !taskSpan(task) && task.status !== TaskStatus.DONE).length,
    [items],
  );

  const step = (direction: 1 | -1) =>
    setParams({ date: isWeek ? addDays(period, direction * 7) : addMonths(period, direction) });

  /**
   * Move a task to the day it was dropped on. The cache is patched first so the
   * bar stays where it was released instead of springing back for the length of
   * a round trip; the write invalidates on success, so the server's answer
   * replaces the guess a moment later. A failure re-fetches, which puts the bar
   * back where it really is, and says so.
   */
  function reschedule(task: CalendarTask, day: string) {
    const input = rescheduleTo(task, day);
    const unchanged =
      (input.startDate ?? task.startDate.slice(0, 10)) === task.startDate.slice(0, 10) &&
      (input.endDate ?? task.endDate.slice(0, 10)) === task.endDate.slice(0, 10);
    if (unchanged) return;

    qc.setQueriesData<{ items: TaskDto[] }>({ queryKey: ['tasks'] }, (old) =>
      old?.items
        ? {
            ...old,
            items: old.items.map((tk) =>
              tk.id === task.id
                ? // `dueDate` is the legacy mirror of `endDate`; the server keeps
                  // them in sync, so the optimistic copy must too or the bar
                  // would read the stale one.
                  { ...tk, ...input, dueDate: input.endDate ?? tk.dueDate }
                : tk,
            ),
          }
        : old,
    );

    update.mutate(
      { id: task.id, input },
      {
        onError: (err) => {
          qc.invalidateQueries({ queryKey: ['tasks'] });
          toast.error(t('calendar.rescheduleFailed'), { description: (err as Error).message });
        },
      },
    );
  }

  function onDragStart(event: DragStartEvent) {
    setDragging((event.active.data.current?.task as CalendarTask) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    const task = dragging;
    setDragging(null);
    const day = event.over?.id;
    if (typeof day === 'string' && task) reschedule(task, day);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  return (
    <IssueBoardLayout
      title={t('calendar.title')}
      subtitle={t('calendar.subtitle')}
      search={{ value: search, onChange: setSearch, placeholder: t('calendar.search') }}
      view={{
        value: view,
        onChange: (v) => setParams({ view: v === 'week' ? 'week' : '' }),
        options: [
          { value: 'month', label: t('calendar.month'), icon: <CalendarDays /> },
          { value: 'week', label: t('calendar.week'), icon: <CalendarRange /> },
        ],
      }}
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => step(-1)}
              aria-label={t('calendar.previous')}
            >
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setParams({ date: '' })}>
              {t('calendar.today')}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => step(1)}
              aria-label={t('calendar.next')}
            >
              <ChevronRight />
            </Button>
          </div>
          <span className="text-sm font-semibold tracking-tight">
            {periodLabel(period, isWeek)}
          </span>
          <SourceToggle
            sources={sources}
            onToggle={(src) => {
              // One source must stay on — with none, the grid would be blank and
              // the URL would need a fourth state to say so.
              if (sources.includes(src) && sources.length === 1) return;
              const next = sources.includes(src)
                ? sources.filter((s) => s !== src)
                : [...sources, src];
              setParams({ source: next.length === CALENDAR_SOURCES.length ? '' : next[0] });
            }}
          />
        </div>
      }
      filtersEnd={
        <div className="flex items-center gap-2">
          {/* Late work is the one thing you shouldn't have to go looking for, so
              it's counted here whether or not it falls in the month you're on —
              and clicking jumps to the earliest one's period. */}
          {!!load?.overdue.length && (
            <button
              type="button"
              onClick={() => setParams({ date: taskSpan(load.overdue[0])!.end })}
              aria-label={t('calendar.overdueGoto')}
            >
              {/* Soft-toned, matching the `success`/`warning` badge variants —
                  a solid destructive slab out-shouts every other thing in the
                  toolbar for what is a count, not an alarm. */}
              <Badge
                variant="muted"
                className="cursor-pointer gap-1 border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15"
              >
                <AlertTriangle className="size-3" aria-hidden />
                {t('calendar.overdueCount').replace('{n}', String(load.overdue.length))}
              </Badge>
            </button>
          )}
          {unscheduledCount > 0 && (
            <button type="button" onClick={() => setUnscheduledOpen(true)}>
              <Badge variant="muted" className="cursor-pointer gap-1 hover:bg-accent">
                {t('calendar.unscheduledCount').replace('{n}', String(unscheduledCount))}
              </Badge>
            </button>
          )}
        </div>
      }
      actions={<Button onClick={() => setQuickAddDay(todayISO())}>+ {t('calendar.new')}</Button>}
    >
      {isLoading ? (
        <CalendarSkeleton weeks={weeks.length} />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <CalendarGrid
            weeks={weeks}
            month={isWeek ? undefined : period}
            tasks={filtered}
            maxLanes={isWeek ? undefined : MONTH_MAX_LANES}
            colorOf={colorOf}
            onOpen={(task) => navigate(`/issues/${task.shortId || task.id}`)}
            onAdd={setQuickAddDay}
            onPeek={setPeekDay}
            draggingId={dragging?.id ?? null}
            workload={workload}
          />
          <DragOverlay dropAnimation={null}>
            {dragging && <CalendarDragBar task={dragging} color={colorOf(dragging)} />}
          </DragOverlay>
        </DndContext>
      )}

      {quickAddDay && <QuickAddDialog day={quickAddDay} onClose={() => setQuickAddDay(null)} />}
      {peekDay && (
        <DayPeekDialog
          day={peekDay}
          tasks={filtered}
          colorOf={colorOf}
          onClose={() => setPeekDay(null)}
          onAdd={setQuickAddDay}
        />
      )}
      <UnscheduledDrawer
        open={unscheduledOpen}
        tasks={items}
        colorOf={colorOf}
        onClose={() => setUnscheduledOpen(false)}
      />
    </IssueBoardLayout>
  );
}

/** Which lists are drawn. Two toggles rather than a dropdown: both states are
 *  visible at a glance, which is the point — you should never wonder whether
 *  your private tasks are on the calendar you're looking at. */
function SourceToggle({
  sources,
  onToggle,
}: {
  sources: CalendarSource[];
  onToggle: (source: CalendarSource) => void;
}) {
  const options = [
    { key: 'personal' as const, label: t('calendar.sourcePersonal'), Icon: Lock },
    { key: 'assigned' as const, label: t('calendar.sourceAssigned'), Icon: UserCheck },
  ];

  return (
    <div className="flex items-center gap-1 rounded-md border p-0.5">
      {options.map(({ key, label, Icon }) => {
        const on = sources.includes(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(key)}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded px-2 text-xs transition-colors',
              on
                ? 'bg-secondary font-medium text-secondary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * "August 2026", or "Aug 2 – 8, 2026" for a week — in the UI's own language.
 *
 * The week's two ends go through `formatRange`, not through two `format` calls
 * glued together with a dash: only `formatRange` knows that English puts the
 * month first and drops the repeat ("Aug 2 – 8"), that Korean writes
 * "2026년 8월 2일 ~ 8일", and what to do when the week straddles a month or a
 * year. Hand-assembling it gave "2 – Aug 8 2026" in English, which is nobody's
 * date format.
 */
function periodLabel(period: string, isWeek: boolean): string {
  const start = parseISO(period);
  if (!start) return period;
  if (!isWeek) {
    return new Intl.DateTimeFormat(localeTag(), { month: 'long', year: 'numeric' }).format(start);
  }
  const end = parseISO(addDays(period, 6))!;
  return new Intl.DateTimeFormat(localeTag(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).formatRange(start, end);
}
