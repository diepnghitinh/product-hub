import { Link, useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useEscapeBack } from '@/lib/useEscapeBack';
import { Button, Combobox, DotLabel, Select, Spinner } from '@/components/ui';
import { t } from '@/i18n';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { Icon } from '@/components/Icon';
import { timeAgo } from '@/lib/format';
import { useUsers } from '@/features/users/api';
import { IssueDetailMain } from '@/features/issues/IssueDetailMain';
import { useTeamStatuses } from '@/features/teams/api';
import { TeamIssueType } from '@/types/enums';
import { useDeleteTask, useSetTaskStatus, useTask, useUpdateTask } from './api';
import { CenteredPageLayout } from '@/layouts/shared';

/** Same uppercase field label as the Bug detail sidebar (`ROW_LABEL` there). */
const PROP_LABEL = 'text-xs font-medium uppercase tracking-wide text-muted-foreground';

/** One task's detail — laid out like the Linear issue view: a wide content
 * column (title · description · activity) beside a Properties sidebar. The main
 * column is the shared <IssueDetailMain>, so Tasks and Bugs read as one product. */
export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { user, canManageDelivery: isAdmin, canEditDelivery: canWrite } = useAuth();
  useEscapeBack();

  const { data: task, isLoading } = useTask(taskId);
  const update = useUpdateTask();
  const setStatus = useSetTaskStatus();
  const remove = useDeleteTask();

  // People list — readable by any member now, so @-mentions work for everyone.
  const { data: usersData } = useUsers({ limit: 100 });
  const users = usersData?.items ?? [];

  // Columns come from the team that owns this task.
  const columns = useTeamStatuses(task?.teamId, TeamIssueType.TASK);
  const statusCol = columns.find((c) => c.key === task?.status);

  const save = (input: Parameters<typeof update.mutate>[0]['input']) =>
    task && update.mutate({ id: task.id, input });

  if (isLoading) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed p-8">
        <Spinner />
      </div>
    );
  }
  if (!task) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        {t('tasks.notFound')}{' '}
        <Link
          to="/tasks"
          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t('tasks.myTasks')}
        </Link>
      </div>
    );
  }

  return (
    <CenteredPageLayout>
      {/* Breadcrumb (My Tasks › TSK-7) */}
      {/* This page's own breadcrumb moved up into the shell's topbar. Tasks
          aren't in the nav model, so the parent is named here. */}
      <PageHeader
        title={task.shortId || task.title}
        parent={{ to: '/tasks', label: t('tasks.myTasks') }}
        leading={<Icon name="tasks" size={16} className="shrink-0 text-muted-foreground" />}
      />

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* ── Main column (shared with Bug detail) ────────────────────────── */}
        <IssueDetailMain
          key={task.id}
          subject="task"
          issueId={task.id}
          shortId={task.shortId}
          title={task.title}
          titlePlaceholder={t('tasks.titleLabel')}
          description={task.description}
          descriptionPlaceholder={t('tasks.addDescription')}
          createdByName={task.createdByName}
          createdAt={task.createdAt}
          createdLabel={t('tasks.createdThis')}
          canWrite={canWrite}
          isAdmin={isAdmin}
          currentUserId={user?.id}
          users={users}
          onSaveTitle={(title) => save({ title })}
          onSaveDescription={(description) => save({ description })}
        />

        {/* ── Properties sidebar ──────────────────────────────────────────── */}
        {/* Same card + labelled-control style as the Bug detail sidebar
            (`BugDetail.tsx`) so Tasks and Bugs read as one product. */}
        <aside className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm lg:sticky lg:top-6">
          <div className="flex flex-col gap-1">
            <span className={PROP_LABEL}>{t('tasks.status')}</span>
            {canWrite ? (
              <Select
                value={task.status}
                onValueChange={(v) => setStatus.mutate({ id: task.id, status: v })}
                options={columns.map((c) => ({
                  value: c.key,
                  label: <DotLabel color={c.color}>{c.label}</DotLabel>,
                }))}
              />
            ) : (
              <DotLabel color={statusCol?.color ?? 'hsl(var(--muted-foreground))'}>
                {statusCol?.label ?? task.status}
              </DotLabel>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className={PROP_LABEL}>{t('tasks.assignee')}</span>
            {isAdmin ? (
              <Combobox
                value={task.assigneeId || ''}
                onChange={(v) => save({ assigneeId: v })}
                placeholder={t('tasks.unassigned')}
                options={[
                  { value: '', label: t('tasks.unassigned') },
                  ...users.map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
            ) : canWrite ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() =>
                  save({ assigneeId: task.assigneeId === user?.id ? '' : user?.id ?? '' })
                }
              >
                {task.assigneeId === user?.id ? t('tasks.assignedYou') : t('tasks.assignMe')}
              </Button>
            ) : (
              <span className="text-sm">{task.assigneeName || t('tasks.unassigned')}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className={PROP_LABEL}>{t('tasks.backlogItem')}</span>
            {task.roadmapId ? (
              <Link
                to={`/roadmaps/${task.roadmapId}`}
                className="truncate text-sm font-medium underline-offset-4 hover:underline"
                title={task.roadmapItemLabel || t('tasks.openRoadmaps')}
              >
                {task.roadmapItemLabel || t('tasks.openRoadmaps')}
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground">{t('tasks.noBacklogItem')}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className={PROP_LABEL}>{t('tasks.created')}</span>
            <span className="text-sm text-muted-foreground">
              {task.createdByName || '—'} · {timeAgo(task.createdAt)}
            </span>
          </div>

          {canWrite && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 self-start text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                if (confirm(t('tasks.confirmDelete')))
                  remove.mutate(task.id, { onSuccess: () => navigate('/tasks') });
              }}
            >
              <Trash2 className="size-3.5" />
              {t('common.delete')}
            </Button>
          )}
        </aside>
      </div>
    </CenteredPageLayout>
  );
}
