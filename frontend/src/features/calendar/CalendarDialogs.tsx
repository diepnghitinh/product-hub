import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, Lock, Plus } from 'lucide-react';
import { Button, DatePicker, Dialog, DotLabel, Drawer, Input, Select } from '@/components/ui';
import { localeTag, t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { usePersonalStatuses, useCreateTask, useUpdateTask } from '@/features/tasks/api';
import { useTeams, useTeamStatuses } from '@/features/teams/api';
import { TaskStatus, TeamIssueType } from '@/types/enums';
import type { CalendarTask } from './api';
import { parseISO, taskSpan } from './model';

/** The dialogs the calendar opens over its grid: quick-add, a day in full, and
 *  the tasks that carry no date at all. */

/** A day written the way the UI language writes it — "Mon, 3 Aug 2026". */
export function formatDay(day: string): string {
  const date = parseISO(day);
  return date
    ? date.toLocaleDateString(localeTag(), {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : day;
}

/**
 * Add a task straight onto a day. Where it goes is a single choice — your own
 * private board, or a team's list assigned to you — because those are exactly
 * the two things the calendar draws; creating into anything else would make a
 * task that vanishes the moment the dialog closes.
 *
 * A team task is assigned to you on create for the same reason: the calendar's
 * team source is "assigned to me", so an unassigned one wouldn't appear.
 * Anything richer (description, estimate, backlog link) is one click away on the
 * full create page, which opens with this day already filled in.
 */
export function QuickAddDialog({ day, onClose }: { day: string; onClose: () => void }) {
  const { user } = useAuth();
  const create = useCreateTask();
  const { data: personalColumns = [] } = usePersonalStatuses();
  const { data: teams } = useTeams();
  const taskTeams = (teams ?? []).filter(
    (team) => !team.archived && team.issueType === TeamIssueType.TASK,
  );

  // '' = the private personal board; anything else is a team id.
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const teamColumns = useTeamStatuses(target || undefined, TeamIssueType.TASK);
  const columns = target ? teamColumns : personalColumns;
  const effectiveStatus = columns.find((c) => c.key === status)?.key ?? columns[0]?.key;

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed || create.isPending) return;
    setError(null);
    try {
      await create.mutateAsync({
        title: trimmed,
        status: effectiveStatus,
        // A day gets both ends, so the task is a one-day bar rather than a
        // deadline with no beginning — drag it wider later if it grows.
        startDate: day,
        endDate: day,
        ...(target ? { teamId: target, assigneeIds: user ? [user.id] : [] } : { personal: true }),
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('calendar.quickAddTitle')}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={submit}
            loading={create.isPending}
            disabled={!title.trim()}
          >
            {t('personal.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* The day is the one thing this dialog can't change — it's where you
            clicked — so it's stated rather than offered as a field. */}
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="size-4 shrink-0" aria-hidden />
          {formatDay(day)}
        </p>

        <Input
          autoFocus
          value={title}
          placeholder={t('personal.quickAddPlaceholder')}
          aria-label={t('tasks.titleLabel')}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">{t('calendar.addTo')}</span>
            <Select
              value={target}
              onValueChange={(v) => {
                setTarget(v);
                // The old column key means nothing on the new board.
                setStatus(undefined);
              }}
              options={[
                { value: '', label: t('calendar.addToPersonal') },
                ...taskTeams.map((team) => ({ value: team.id, label: team.name })),
              ]}
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">{t('tasks.status')}</span>
            <Select
              value={effectiveStatus}
              onValueChange={setStatus}
              options={columns.map((c) => ({
                value: c.key,
                label: <DotLabel color={c.color}>{c.label}</DotLabel>,
              }))}
            />
          </label>
        </div>

        {/* Only for a team task. The full create page writes a team issue — it
            has no private board to write to — so offering it while "Personal" is
            selected would file the task somewhere the calendar never shows it. */}
        {target && (
          <Link
            to={`/tasks/new?teamId=${target}&startDate=${day}&endDate=${day}`}
            onClick={onClose}
            className="inline-block text-sm text-primary underline-offset-4 hover:underline"
          >
            {t('calendar.moreOptions')}
          </Link>
        )}
      </div>
    </Dialog>
  );
}

/** Everything on one day, in full — where the month grid's "+N more" leads, and
 *  where a click on a day number goes. */
export function DayPeekDialog({
  day,
  tasks,
  colorOf,
  onClose,
  onAdd,
}: {
  day: string;
  tasks: CalendarTask[];
  colorOf: (task: CalendarTask) => string;
  onClose: () => void;
  onAdd: (day: string) => void;
}) {
  const onDay = tasks
    .filter((task) => {
      const span = taskSpan(task);
      return !!span && span.start <= day && span.end >= day;
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <Dialog
      open
      onClose={onClose}
      title={formatDay(day)}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onClose();
              onAdd(day);
            }}
          >
            <Plus className="size-4" aria-hidden />
            {t('calendar.new')}
          </Button>
        </>
      }
    >
      {onDay.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t('calendar.noneOnDay')}</p>
      ) : (
        <ul className="-mx-2 max-h-[50vh] overflow-y-auto">
          {onDay.map((task) => (
            <li key={task.id}>
              <TaskRow task={task} color={colorOf(task)} onNavigate={onClose} />
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/**
 * The tasks that carry no dates at all. They can't be drawn on a grid of days,
 * and quietly leaving them out is how a calendar starts lying about your
 * workload — so the toolbar keeps a count of them, and this is where it opens.
 * Each row can be given a day right here without leaving the calendar.
 */
export function UnscheduledDrawer({
  open,
  tasks,
  colorOf,
  onClose,
}: {
  open: boolean;
  tasks: CalendarTask[];
  colorOf: (task: CalendarTask) => string;
  onClose: () => void;
}) {
  const update = useUpdateTask();
  const undated = tasks
    .filter((task) => !taskSpan(task) && task.status !== TaskStatus.DONE)
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t('calendar.unscheduled')}
      widthClassName="sm:max-w-lg"
    >
      {/* Drawer's own title is visually hidden — the body carries the heading. */}
      <div>
        <h2 className="text-base font-semibold tracking-tight">{t('calendar.unscheduled')}</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">{t('calendar.unscheduledHint')}</p>
        {undated.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('calendar.unscheduledNone')}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {undated.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-2 rounded-lg border bg-card p-2 pl-3 text-card-foreground"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: colorOf(task) }}
                  aria-hidden
                />
                {task.source === 'personal' && (
                  <Lock
                    className="size-3 shrink-0 text-muted-foreground"
                    aria-label={t('calendar.private')}
                  />
                )}
                <Link
                  to={`/issues/${task.shortId || task.id}`}
                  onClick={onClose}
                  className="min-w-0 flex-1 truncate text-sm hover:underline"
                >
                  {task.title}
                </Link>
                {/* Sets the deadline only — the calendar shouldn't invent a start
                    date the user never chose. */}
                <DatePicker
                  value=""
                  clearable={false}
                  placeholder={t('calendar.schedule')}
                  className="w-[140px] shrink-0"
                  onChange={(date) =>
                    date && update.mutate({ id: task.id, input: { endDate: date } })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}

/** One task as a list row — shared by the day peek. */
function TaskRow({
  task,
  color,
  onNavigate,
}: {
  task: CalendarTask;
  color: string;
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  const done = task.status === TaskStatus.DONE;

  return (
    <button
      type="button"
      onClick={() => {
        onNavigate();
        navigate(`/issues/${task.shortId || task.id}`);
      }}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {task.source === 'personal' && (
        <Lock
          className="size-3 shrink-0 text-muted-foreground"
          aria-label={t('calendar.private')}
        />
      )}
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          done && 'text-muted-foreground line-through',
        )}
      >
        {task.title}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{task.shortId}</span>
    </button>
  );
}
