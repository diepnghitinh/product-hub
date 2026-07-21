import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Combobox, ProgressBar, Select, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useUsers } from '@/features/users/api';
import { useTeamStatusesLookup } from '@/features/teams/api';
import { TaskStatus, TeamIssueType, taskStatusColor } from '@/types/enums';
import { useCreateTask, useDeleteTask, useSetTaskStatus, useTasks, useUpdateTask } from '../api';
import { TaskComposerCard } from './TaskComposerCard';

interface SubtaskPanelProps {
  /** The parent task whose sub-tasks these are. */
  parentId: string;
  /** Team a new sub-task inherits (the parent's team). */
  teamId: string;
}

/**
 * Sub-tasks for one task — the task-detail twin of {@link TaskPanel}. A sub-task
 * is a real task with `parentId` set, so it also shows on the team board; adding
 * one here inherits the parent's team, and completed children drive the
 * "N of M done" rollup. Rendered above Activity via IssueDetailMain's
 * `beforeActivity` slot (tasks only — bugs pass nothing).
 */
export function SubtaskPanel({ parentId, teamId }: SubtaskPanelProps) {
  const { user, canManageDelivery: isAdmin, canEditDelivery: canWrite } = useAuth();
  // People list is readable by any member, so assignees resolve for everyone.
  const { data: usersData } = useUsers({ limit: 100 });
  const users = usersData?.items ?? [];

  const { data, isLoading } = useTasks({ parentId });
  const tasks = data?.items ?? [];
  // Sub-tasks inherit the parent's team, but resolve per-row to stay correct.
  const statusesFor = useTeamStatusesLookup();

  const create = useCreateTask();
  const update = useUpdateTask();
  const setStatus = useSetTaskStatus();
  const remove = useDeleteTask();

  const done = tasks.filter((tk) => tk.status === TaskStatus.DONE).length;
  const total = tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const [adding, setAdding] = useState(false);

  return (
    <section className="mt-8 border-t border-border pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('subtasks.title')}
        </span>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {t('tasks.doneOf').replace('{done}', String(done)).replace('{total}', String(total))}
            </span>
          )}
          {canWrite && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="grid size-6 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t('subtasks.add')}
            >
              <Plus className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {total > 0 && (
        <div className="mb-3">
          <ProgressBar value={pct} />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {isLoading ? (
          <div className="flex justify-center py-3">
            <Spinner />
          </div>
        ) : tasks.length === 0 && !adding ? (
          <p className="py-2 text-sm text-muted-foreground">{t('subtasks.empty')}</p>
        ) : (
          tasks.map((tk) => {
            const mine = !!user && tk.assigneeId === user.id;
            return (
              <div
                key={tk.id}
                className={cn(
                  'grid items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5',
                  canWrite
                    ? 'grid-cols-[minmax(0,1fr)_128px_150px_28px]'
                    : 'grid-cols-[minmax(0,1fr)_128px_150px]',
                )}
              >
                {/* Title (+ status dot) — opens the sub-task's own detail. */}
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: taskStatusColor(tk.status) }}
                    aria-hidden
                  />
                  <Link
                    to={`/tasks/${tk.shortId || tk.id}`}
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm underline-offset-4 hover:underline',
                      tk.status === TaskStatus.DONE && 'text-muted-foreground line-through',
                    )}
                    title={tk.title}
                  >
                    {tk.title}
                  </Link>
                </div>

                {/* Status */}
                {canWrite ? (
                  <Select
                    value={tk.status}
                    onValueChange={(v) => setStatus.mutate({ id: tk.id, status: v })}
                    options={statusesFor(tk.teamId, TeamIssueType.TASK).map((c) => ({
                      value: c.key,
                      label: c.label,
                    }))}
                    className="h-7 w-full"
                    aria-label={t('roadmaps.status')}
                  />
                ) : (
                  <span className="truncate text-xs text-muted-foreground">
                    {statusesFor(tk.teamId, TeamIssueType.TASK).find((c) => c.key === tk.status)
                      ?.label ?? tk.status}
                  </span>
                )}

                {/* Assignee */}
                <div className="flex min-w-0 items-center">
                  {isAdmin ? (
                    <Combobox
                      value={tk.assigneeId || ''}
                      onChange={(v) => update.mutate({ id: tk.id, input: { assigneeId: v } })}
                      placeholder={t('tasks.assign')}
                      className="h-7 w-full"
                      options={[
                        { value: '', label: t('tasks.unassigned') },
                        ...users.map((u) => ({ value: u.id, label: u.name })),
                      ]}
                    />
                  ) : canWrite ? (
                    <Button
                      type="button"
                      variant={mine ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-7"
                      onClick={() =>
                        update.mutate({
                          id: tk.id,
                          input: { assigneeId: mine ? '' : user?.id ?? '' },
                        })
                      }
                    >
                      {mine ? t('tasks.assignedYou') : t('tasks.assignMe')}
                    </Button>
                  ) : (
                    <span className="truncate text-xs text-muted-foreground">
                      {tk.assigneeName || t('tasks.unassigned')}
                    </span>
                  )}
                </div>

                {/* Delete */}
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(tk.id)}
                    className="justify-self-end rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {canWrite &&
        (adding ? (
          <TaskComposerCard
            defaultTeamId={teamId}
            users={users}
            pending={create.isPending}
            titlePlaceholder={t('subtasks.titlePlaceholder')}
            onCancel={() => setAdding(false)}
            onCreate={(input, done) =>
              create.mutate(
                { ...input, parentId, teamId: teamId || undefined },
                {
                  // Keep the card open with its property picks so you can batch several.
                  onSuccess: () => done(),
                },
              )
            }
          />
        ) : (
          tasks.length > 0 && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-3.5" />
              {t('subtasks.add')}
            </button>
          )
        ))}
    </section>
  );
}
