import { Link, useNavigate, useParams } from 'react-router-dom';
import { Circle, Trash2, Triangle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useEscapeBack } from '@/lib/useEscapeBack';
import { cn } from '@/lib/utils';
import { Combobox, DatePicker, DotLabel, MultiSelect, Select, Skeleton, Spinner } from '@/components/ui';
import { t } from '@/i18n';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { Icon } from '@/components/Icon';
import { initials, timeAgo } from '@/lib/format';
import { useUsers } from '@/features/users/api';
import { IssueDetail, PropField } from '@/features/issues/IssueDetail';
import { useTeams, useTeamStatuses, useTeamLabels } from '@/features/teams/api';
import { LabelChips, resolveLabels } from '@/features/labels/LabelChips';
import { TeamIconPicker } from '@/features/teams/TeamIconPicker';
import {
  FavouriteKind,
  IssueKind,
  TASK_ESTIMATES,
  TaskStatus,
  TeamIssueType,
  taskEstimateLabel,
} from '@/types/enums';
import { useDeleteTask, useSetTaskStatus, useTask, useUpdateTask } from './api';
import { CenteredPageLayout } from '@/layouts/shared';
import { useRelationActions } from '@/features/issues/useRelationActions';
import { IssueRelations } from '@/features/issues/IssueRelations';

/** Local calendar day (`YYYY-MM-DD`) — string-compared to `dueDate` so timezones
 * never shift the overdue boundary. */
const todayStr = () => new Date().toLocaleDateString('en-CA');
const formatDueDate = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

/** One task's detail. The body is the shared <IssueDetail> (main column +
 * Properties sidebar) — identical layout to Bug detail; only the sidebar rows
 * and the page's breadcrumb differ. */
export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { user, canManageDelivery: isAdmin, canEditDelivery: canWrite } = useAuth();
  useEscapeBack();

  const { data: task, isLoading } = useTask(taskId);
  const update = useUpdateTask();
  const setStatus = useSetTaskStatus();
  const remove = useDeleteTask();
  const { markAsItem, picker } = useRelationActions(IssueKind.TASK, task?.id ?? '');

  // People list — readable by any member now, so @-mentions work for everyone.
  const { data: usersData } = useUsers({ limit: 100 });
  const users = usersData?.items ?? [];

  // Columns come from the team that owns this task.
  const columns = useTeamStatuses(task?.teamId, TeamIssueType.TASK);
  const statusCol = columns.find((c) => c.key === task?.status);
  // Labels are the task's team's own set — the same source the settings editor writes.
  const teamLabels = useTeamLabels(task?.teamId);

  // Breadcrumb parent: the task's own team board when resolvable, so the crumb
  // tells you which team the task belongs to — falls back to "My Tasks" if the
  // task has no resolvable team. The leading icon follows suit: a skeleton
  // while teams are still loading (never a guessed icon), the team's own
  // symbol once resolved, or — for a genuinely team-less task — the current
  // user's own avatar, matching the sidebar's "Assigned to me" treatment.
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const team = teams?.find((tm) => tm.id === task?.teamId);
  const parent = team
    ? { to: `/teams/${team.id}`, label: team.name }
    : { to: '/tasks', label: t('tasks.myTasks') };
  const leadingIcon = teamsLoading ? (
    <Skeleton className="size-4 shrink-0 rounded-full" />
  ) : team ? (
    <span className="flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent/60 hover:text-accent-foreground">
      <TeamIconPicker team={team} readOnly size={16} className="shrink-0 text-muted-foreground" />
    </span>
  ) : user ? (
    <span
      className="grid size-4 shrink-0 place-items-center rounded-full bg-primary text-[8px] font-semibold text-primary-foreground flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent/60 hover:text-accent-foreground"
    >
      {initials(user.name, user.email)}
    </span>
  ) : (
    <span className="flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent/60 hover:text-accent-foreground">
      <Icon name="tasks" size={16} className="shrink-0" />
    </span>
  );

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
      {/* Breadcrumb (My Tasks › TSK-7) — tasks aren't in the nav model, so the
          parent is named here. */}
      <PageHeader
        title={task.shortId || task.title}
        parent={parent}
        leading={leadingIcon}
      />

      <IssueDetail
        key={task.id}
        subject="task"
        issueId={task.id}
        favourite={{ kind: FavouriteKind.TASK, refId: task.id }}
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
        menuTarget="topbar"
        menuItems={
          canWrite
            ? [
                markAsItem,
                {
                  label: t('common.delete'),
                  danger: true,
                  closeOnSelect: true,
                  icon: <Trash2 className="size-4" />,
                  onClick: () => {
                    if (confirm(t('tasks.confirmDelete')))
                      remove.mutate(task.id, { onSuccess: () => navigate('/tasks') });
                  },
                },
              ]
            : []
        }
        sidebar={
          <>
            <PropField label={t('tasks.status')}>
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
            </PropField>

            <PropField label={t('tasks.assignee')}>
              {canWrite ? (
                <Combobox
                  value={task.assigneeId || ''}
                  onChange={(v) => save({ assigneeId: v })}
                  placeholder={t('tasks.unassigned')}
                  options={[
                    { value: '', label: t('tasks.unassigned') },
                    ...users.map((u) => ({ value: u.id, label: u.name })),
                  ]}
                />
              ) : (
                <span className="text-sm">{task.assigneeName || t('tasks.unassigned')}</span>
              )}
            </PropField>

            <PropField label={t('labels.title')}>
              {canWrite ? (
                teamLabels.length > 0 ? (
                  <MultiSelect
                    value={task.labelKeys ?? []}
                    onChange={(keys) => save({ labelKeys: keys })}
                    placeholder={t('labels.pick')}
                    options={teamLabels.map((l) => ({
                      value: l.key,
                      label: <DotLabel color={l.color}>{l.name}</DotLabel>,
                      text: l.name,
                    }))}
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">{t('labels.noneForTeam')}</span>
                )
              ) : resolveLabels(task.labelKeys, teamLabels).length > 0 ? (
                <LabelChips keys={task.labelKeys} labels={teamLabels} />
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </PropField>

            <PropField label={t('tasks.dueDate')}>
              {canWrite ? (
                <DatePicker
                  value={task.dueDate}
                  onChange={(v) => save({ dueDate: v })}
                  placeholder={t('tasks.noDueDate')}
                />
              ) : task.dueDate ? (
                <span
                  className={cn(
                    'text-sm',
                    task.dueDate < todayStr() &&
                      task.status !== TaskStatus.DONE &&
                      'font-medium text-destructive',
                  )}
                >
                  {formatDueDate(task.dueDate)}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">{t('tasks.noDueDate')}</span>
              )}
            </PropField>

            <PropField label={t('tasks.estimate')}>
              {canWrite ? (
                <Combobox
                  value={String(task.estimate || 0)}
                  onChange={(v) => save({ estimate: Number(v) })}
                  placeholder={t('tasks.noEstimate')}
                  searchPlaceholder={t('tasks.setEstimateTo')}
                  options={[
                    {
                      value: '0',
                      label: t('tasks.noEstimate'),
                      icon: <Circle className="size-3.5 text-muted-foreground" />,
                    },
                    ...TASK_ESTIMATES.map((v) => ({
                      value: String(v),
                      label: taskEstimateLabel(v),
                      icon: <Triangle className="size-3 fill-current text-muted-foreground" />,
                    })),
                  ]}
                />
              ) : task.estimate ? (
                <span className="flex items-center gap-2 text-sm">
                  <Triangle className="size-3 fill-current text-muted-foreground" />
                  {taskEstimateLabel(task.estimate)}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">{t('tasks.noEstimate')}</span>
              )}
            </PropField>

            <PropField label={t('tasks.backlogItem')}>
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
            </PropField>

            <PropField label={t('tasks.created')}>
              <span className="text-sm text-muted-foreground">
                {task.createdByName || '—'} · {timeAgo(task.createdAt)}
              </span>
            </PropField>

            <IssueRelations subject={IssueKind.TASK} issueId={task.id} canWrite={canWrite} />
            {picker}
          </>
        }
      />
    </CenteredPageLayout>
  );
}
