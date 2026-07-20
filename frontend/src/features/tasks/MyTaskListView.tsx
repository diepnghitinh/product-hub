import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Checkbox, Spinner } from '@/components/ui';
import { BOARD_GUTTER, IssueBoardLayout } from '@/components/IssueBoardLayout';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { TaskStatus } from '@/types/enums';
import type { TaskDto } from '@/types/dto';
import { useSetTaskStatus, useTasks } from './api';

/** Local calendar day (YYYY-MM-DD) — string-compared to a task's `dueDate` so
 * timezones never shift the boundary. */
const todayStr = () => new Date().toLocaleDateString('en-CA');
const dueDay = (task: TaskDto) => (task.dueDate ? task.dueDate.slice(0, 10) : '');
const formatDay = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * The two flat "My Tasks" sub-views. Both list every task assigned to (or created
 * by) me across all teams; `mode` chooses the slice and grouping:
 *  - `today`    → not-done tasks due today or overdue, split into Overdue / Today.
 *  - `personal` → the whole personal list as one flat, checkable list.
 */
export function MyTaskListView({ mode }: { mode: 'today' | 'personal' }) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const { data, isLoading } = useTasks({
    mine: user?.id ?? '__none__',
    search: search || undefined,
  });
  const setStatus = useSetTaskStatus();
  const tasks = data?.items ?? [];

  const { overdue, dueToday, personal } = useMemo(() => {
    const now = todayStr();
    const active = tasks.filter((tk) => tk.status !== TaskStatus.DONE);
    return {
      overdue: active.filter((tk) => dueDay(tk) && dueDay(tk) < now),
      dueToday: active.filter((tk) => dueDay(tk) === now),
      // Personal: not-done first, then by due date (undated last), then title.
      personal: [...tasks].sort((a, b) => {
        const done = Number(a.status === TaskStatus.DONE) - Number(b.status === TaskStatus.DONE);
        if (done) return done;
        const da = dueDay(a) || '9999';
        const db = dueDay(b) || '9999';
        return da === db ? a.title.localeCompare(b.title) : da < db ? -1 : 1;
      }),
    };
  }, [tasks]);

  const toggle = (task: TaskDto) =>
    setStatus.mutate({
      id: task.id,
      status: task.status === TaskStatus.DONE ? TaskStatus.TODO : TaskStatus.DONE,
    });

  const isToday = mode === 'today';
  const empty = isToday ? overdue.length + dueToday.length === 0 : personal.length === 0;

  return (
    <IssueBoardLayout
      title={isToday ? t('tasks.today') : t('tasks.personalList')}
      subtitle={isToday ? t('tasks.todaySubtitle') : t('tasks.personalSubtitle')}
      search={{ value: search, onChange: setSearch, placeholder: t('tasks.search') }}
    >
      <div className={cn('min-h-0 flex-1 overflow-y-auto py-4 md:py-6', BOARD_GUTTER)}>
        {isLoading ? (
          <div className="grid place-items-center rounded-xl border border-dashed p-8">
            <Spinner />
          </div>
        ) : empty ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            {isToday ? t('tasks.noneToday') : t('tasks.none')}
          </div>
        ) : isToday ? (
          <div className="flex flex-col gap-6">
            <TaskGroup label={t('tasks.overdue')} tone="overdue" tasks={overdue} onToggle={toggle} />
            <TaskGroup label={t('tasks.dueToday')} tasks={dueToday} onToggle={toggle} />
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-2 text-card-foreground shadow-sm">
            {personal.map((task) => (
              <TaskChecklistRow key={task.id} task={task} onToggle={toggle} />
            ))}
          </div>
        )}
      </div>
    </IssueBoardLayout>
  );
}

function TaskGroup({
  label,
  tasks,
  onToggle,
  tone,
}: {
  label: string;
  tasks: TaskDto[];
  onToggle: (t: TaskDto) => void;
  tone?: 'overdue';
}) {
  if (tasks.length === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className={cn('text-sm font-medium', tone === 'overdue' ? 'text-destructive' : 'text-foreground')}>
          {label}
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
      </div>
      <div className="rounded-xl border bg-card p-2 text-card-foreground shadow-sm">
        {tasks.map((task) => (
          <TaskChecklistRow key={task.id} task={task} onToggle={onToggle} overdue={tone === 'overdue'} />
        ))}
      </div>
    </section>
  );
}

/** One row: a check-off box (toggles the task done/todo), the title, its due date
 * and backlog badge, and the short id — the whole row (minus the box) links to
 * the task. */
function TaskChecklistRow({
  task,
  onToggle,
  overdue,
}: {
  task: TaskDto;
  onToggle: (t: TaskDto) => void;
  overdue?: boolean;
}) {
  const done = task.status === TaskStatus.DONE;
  const day = dueDay(task);
  return (
    <div className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent [&:not(:last-child)]:border-b">
      <Checkbox
        checked={done}
        onCheckedChange={() => onToggle(task)}
        aria-label={done ? t('tasks.markTodo') : t('tasks.markDone')}
      />
      <Link
        to={`/tasks/${task.shortId || task.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-foreground"
      >
        <span className={cn('min-w-0 flex-1 truncate text-sm', done && 'text-muted-foreground line-through')}>
          {task.title}
        </span>
        {day && (
          <span
            className={cn(
              'shrink-0 text-[11px] tabular-nums',
              overdue ? 'font-medium text-destructive' : 'text-muted-foreground',
            )}
          >
            {t('tasks.due')} {formatDay(day)}
          </span>
        )}
        {task.roadmapItemLabel && (
          <Badge variant="muted" className="hidden max-w-[28%] shrink-0 truncate sm:inline-flex" title={task.roadmapItemLabel}>
            {task.roadmapItemLabel}
          </Badge>
        )}
        {task.shortId && (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{task.shortId}</span>
        )}
      </Link>
    </div>
  );
}
