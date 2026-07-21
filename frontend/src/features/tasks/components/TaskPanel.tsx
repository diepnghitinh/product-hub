import { useState } from 'react';
import { Link2, Plus, Trash2 } from 'lucide-react';
import { Button, Combobox, ProgressBar, Select, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useUsers } from '@/features/users/api';
import { useTeams, useTeamStatusesLookup } from '@/features/teams/api';
import { TeamIconPicker } from '@/features/teams/TeamIconPicker';
import { TaskStatus, TeamIssueType, taskStatusColor } from '@/types/enums';
import {
  useCreateTask,
  useDeleteTask,
  useSetTaskStatus,
  useTasks,
  useUpdateTask,
} from '../api';
import { PickTaskDialog } from './PickTaskDialog';
import { TaskComposerCard } from './TaskComposerCard';

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
  const { user, canManageDelivery: isAdmin, canEditDelivery: canWrite } = useAuth();

  // /users is admin-only; testers can't list people, but can still self-assign.
  const { data: usersData } = useUsers({ limit: 100 }, isAdmin);
  const users = usersData?.items ?? [];

  const { data, isLoading } = useTasks({ roadmapItemId: itemId });
  const tasks = data?.items ?? [];

  // Columns are per-team, and these tasks can span teams — resolve per row.
  const statusesFor = useTeamStatusesLookup();

  // Which team a new task lands in. Defaults to the workspace's default task
  // team; the picker only surfaces when there's a real choice (>1 task team).
  const { data: teams } = useTeams();
  // These tasks can span teams, so each row is labelled with its own team.
  const teamById = new Map((teams ?? []).map((tm) => [tm.id, tm]));
  const taskTeams = (teams ?? []).filter(
    (tm) => tm.issueType === TeamIssueType.TASK && !tm.archived,
  );
  const defaultTeamId = taskTeams.find((tm) => tm.isDefault)?.id ?? taskTeams[0]?.id ?? '';

  const create = useCreateTask();
  const update = useUpdateTask();
  const setStatus = useSetTaskStatus();
  const remove = useDeleteTask();

  // The people list is admin-only; everyone else can still self-assign at
  // creation, so offer at least themselves in the composer. [[permission-model]]
  const assignableUsers = isAdmin
    ? users
    : user
      ? [{ id: user.id, name: user.name }]
      : [];

  const [adding, setAdding] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);

  const done = tasks.filter((tk) => tk.status === TaskStatus.DONE).length;
  const total = tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

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
            const team = teamById.get(tk.teamId);
            return (
              <div
                key={tk.id}
                className={cn(
                  'grid items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5',
                  // Fixed columns so status · assignee · delete line up across rows.
                  canWrite
                    ? 'grid-cols-[minmax(0,1fr)_128px_150px_28px]'
                    : 'grid-cols-[minmax(0,1fr)_128px_150px]',
                )}
              >
                {/* Title (+ status dot) */}
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: taskStatusColor(tk.status) }}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm',
                      tk.status === TaskStatus.DONE && 'text-muted-foreground line-through',
                    )}
                    title={tk.title}
                  >
                    {tk.title}
                  </span>
                  {/* Which team owns this task — these can span teams. */}
                  {team && (
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                      title={`${t('tasks.team')}: ${team.name}`}
                    >
                      <TeamIconPicker team={team} readOnly size={12} className="shrink-0" />
                      <span className="max-w-[90px] truncate">{team.name}</span>
                    </span>
                  )}
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
                  ) : canWrite && tk.assigneeId && !mine ? (
                    <span
                      className="truncate text-xs text-muted-foreground"
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
            teams={taskTeams}
            defaultTeamId={defaultTeamId}
            users={assignableUsers}
            pending={create.isPending}
            onCancel={() => setAdding(false)}
            onCreate={(input, done) =>
              create.mutate(
                {
                  ...input,
                  roadmapId,
                  roadmapItemId: itemId,
                  roadmapItemLabel: itemLabel,
                  projectId,
                },
                // Keep the card open with its property picks so you can batch several.
                { onSuccess: () => done() },
              )
            }
          />
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" aria-hidden />
              {t('tasks.add')}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setPickOpen(true)}>
              <Link2 className="size-3.5" aria-hidden />
              {t('tasks.pick')}
            </Button>
          </div>
        ))}

      {pickOpen && (
        <PickTaskDialog
          open={pickOpen}
          onClose={() => setPickOpen(false)}
          roadmapId={roadmapId}
          projectId={projectId}
          itemId={itemId}
          itemLabel={itemLabel}
        />
      )}
    </div>
  );
}
