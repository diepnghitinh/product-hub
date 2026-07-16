import { useState, type KeyboardEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Combobox, Input, ProgressBar, Select, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useUsers } from '@/features/users/api';
import {
  Role,
  TASK_STATUS_COLOR,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  TaskStatus,
} from '@/types/enums';
import {
  useCreateTask,
  useDeleteTask,
  useSetTaskStatus,
  useTasks,
  useUpdateTask,
} from '../api';

interface TaskPanelProps {
  roadmapId: string;
  projectId: string;
  /** The linked backlog item (roadmap item) id — tasks created here link to it. */
  itemId: string;
  /** Denormalized label stored on each task, e.g. "Now · Passkey login". */
  itemLabel: string;
}

/**
 * Engineering task checklist for one backlog item (roadmap item). Adding a task
 * here auto-links it (roadmapItemId + denormalized label + parent roadmapId);
 * completed tasks drive the "N of M done" rollup shown above the list.
 */
export function TaskPanel({ roadmapId, projectId, itemId, itemLabel }: TaskPanelProps) {
  const { user } = useAuth();
  const canWrite = user?.role === Role.ADMIN || user?.role === Role.TESTER;
  const isAdmin = user?.role === Role.ADMIN;

  // /users is admin-only; testers can't list people, but can still self-assign.
  const { data: usersData } = useUsers({ limit: 100 }, isAdmin);
  const users = usersData?.items ?? [];

  const { data, isLoading } = useTasks({ roadmapItemId: itemId });
  const tasks = data?.items ?? [];

  const create = useCreateTask();
  const update = useUpdateTask();
  const setStatus = useSetTaskStatus();
  const remove = useDeleteTask();

  const [title, setTitle] = useState('');

  const done = tasks.filter((tk) => tk.status === TaskStatus.DONE).length;
  const total = tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  function add() {
    const value = title.trim();
    if (!value || create.isPending) return;
    create.mutate({
      title: value,
      roadmapId,
      roadmapItemId: itemId,
      roadmapItemLabel: itemLabel,
      projectId,
    });
    setTitle('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Enter creates the task — and never bubbles up to submit the item form.
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  }

  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('tasks.title')}
        </span>
        {total > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {t('tasks.doneOf')
              .replace('{done}', String(done))
              .replace('{total}', String(total))}
          </span>
        )}
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
        ) : tasks.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t('tasks.empty')}</p>
        ) : (
          tasks.map((tk) => {
            const mine = !!user && tk.assigneeId === user.id;
            return (
              <div
                key={tk.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: TASK_STATUS_COLOR[tk.status] }}
                  aria-hidden
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 basis-32 truncate text-sm',
                    tk.status === TaskStatus.DONE && 'text-muted-foreground line-through',
                  )}
                  title={tk.title}
                >
                  {tk.title}
                </span>

                {canWrite ? (
                  <Select
                    value={tk.status}
                    onValueChange={(v) => setStatus.mutate({ id: tk.id, status: v as TaskStatus })}
                    options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }))}
                    className="h-7 w-[124px]"
                    aria-label={t('roadmaps.status')}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {TASK_STATUS_LABEL[tk.status]}
                  </span>
                )}

                {isAdmin ? (
                  <Combobox
                    value={tk.assigneeId || ''}
                    onChange={(v) => update.mutate({ id: tk.id, input: { assigneeId: v } })}
                    placeholder={t('tasks.assign')}
                    className="h-7 w-[140px]"
                    options={[
                      { value: '', label: t('tasks.unassigned') },
                      ...users.map((u) => ({ value: u.id, label: u.name })),
                    ]}
                  />
                ) : canWrite && tk.assigneeId && !mine ? (
                  <span
                    className="max-w-[120px] truncate text-xs text-muted-foreground"
                    title={tk.assigneeName}
                  >
                    {tk.assigneeName}
                  </span>
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
                  <span className="text-xs text-muted-foreground">
                    {tk.assigneeName || t('tasks.unassigned')}
                  </span>
                )}

                {canWrite && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(tk.id)}
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
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

      {canWrite && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('tasks.addPlaceholder')}
            className="h-8"
          />
          <Button type="button" size="sm" onClick={add} disabled={!title.trim() || create.isPending}>
            {t('tasks.add')}
          </Button>
        </div>
      )}
    </div>
  );
}
