import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, Circle, CircleDot, CircleUser, Clock, Gauge, Map as MapIcon, Trash2, Triangle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import {
  Combobox,
  DateRangePicker,
  DotLabel,
  MultiSelect,
  Select,
  Spinner,
  formatDateRange,
} from '@/components/ui';
import { t } from '@/i18n';
import { timeAgo } from '@/lib/format';
import { useUsers } from '@/features/users/api';
import { IssueDetail, PropField, PropSection, PropValue } from '@/features/issues/IssueDetail';
import { useTeams, useTeamStatuses, useTeamLabels, useTeamCustomFields } from '@/features/teams/api';
import { LabelChips, resolveLabels } from '@/features/labels/LabelChips';
import { CustomFields } from '@/features/custom-fields/CustomFields';
import {
  FavouriteKind,
  IssueKind,
  TASK_ESTIMATES,
  TaskStatus,
  TeamIssueType,
  taskEstimateLabel,
} from '@/types/enums';
import {
  useDeleteTask,
  usePersonalStatuses,
  useSetTaskStatus,
  useTask,
  useTasks,
  useUpdateTask,
} from '../api';
import { useRelationActions } from '@/features/issues/useRelationActions';
import { IssueRelations } from '@/features/issues/IssueRelations';
import { PickIssueDialog } from '@/features/issues/PickIssueDialog';
import { SubtaskSection } from './SubtaskSection';

/** Local calendar day (`YYYY-MM-DD`) — string-compared to the end date so
 * timezones never shift the overdue boundary. */
const todayStr = () => new Date().toLocaleDateString('en-CA');

interface TaskDetailProps {
  /** Task shortId or uuid (`useTask` resolves either). */
  taskId: string | undefined;
  /** Called after a successful delete — the route navigates away, a peek drawer
   * closes. When omitted, delete just refreshes. */
  onDeleted?: () => void;
  /** 'topbar' on the standalone route (⋯ in the app header); 'header' (default)
   * when embedded (a peek drawer), which has no topbar of its own. */
  menuTarget?: 'header' | 'topbar';
}

/**
 * The full task detail body — the shared <IssueDetail> (title · description ·
 * sub-tasks · activity, identical to Bug detail) with the task's own Properties
 * sidebar. Extracted from the route page (mirroring {@link BugDetail}) so it can
 * be embedded — the route page wraps this with the breadcrumb + Esc handling,
 * and a sub-task peek renders it inside a drawer.
 */
export function TaskDetail({ taskId, onDeleted, menuTarget = 'header' }: TaskDetailProps) {
  const { user, canManageDelivery: isAdmin, canEditDelivery: canWrite } = useAuth();

  const { data: task, isLoading } = useTask(taskId);
  const update = useUpdateTask();
  const setStatus = useSetTaskStatus();
  const remove = useDeleteTask();
  const [pickOpen, setPickOpen] = useState(false);
  const { markAsItem, picker } = useRelationActions(IssueKind.TASK, task?.id ?? '');

  // People list — readable by any member now, so @-mentions work for everyone.
  const { data: usersData } = useUsers({ limit: 100 });
  const users = usersData?.items ?? [];

  // A personal (private) task draws its status columns from the owner's own
  // Personal board; every other task from the team that owns it. Both hooks run
  // unconditionally (stable order) — only the chosen list is read.
  const isPersonal = !!task?.ownerId;
  const teamColumns = useTeamStatuses(task?.teamId, TeamIssueType.TASK);
  const { data: personalColumns = [] } = usePersonalStatuses();
  const columns = isPersonal ? personalColumns : teamColumns;
  const statusCol = columns.find((c) => c.key === task?.status);
  // Labels are the task's team's own set — the same source the settings editor writes.
  const teamLabels = useTeamLabels(task?.teamId);
  // Custom fields, likewise, come from the task's team.
  const teamCustomFields = useTeamCustomFields(task?.teamId);
  // The task's team — feeds the Sub-tasks composer (its team + status columns).
  const { data: teams } = useTeams();
  const team = teams?.find((tm) => tm.id === task?.teamId);
  // The task's existing sub-tasks — the same query the Sub-tasks section runs, so
  // React Query dedupes it; used only to keep them out of the link-existing picker.
  const { data: childData } = useTasks({ parentId: task?.id ?? '__none__' });

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

  // endDate is authoritative; fall back to the legacy dueDate for any row the
  // backfill hasn't touched yet (the API mirrors them, so this is belt-and-braces).
  const endDate = task.endDate || task.dueDate;
  const childIds = (childData?.items ?? []).map((c) => c.id);
  /** Attach an existing task as a sub-task: set its parent to this task. It keeps
   *  its own team/assignee/etc. — the same "link, don't move" the backlog picker does. */
  const linkExisting = (targetId: string) =>
    update.mutate({ id: targetId, input: { parentId: task.id } }, { onSuccess: () => setPickOpen(false) });

  return (
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
      beforeActivity={
        // A private personal task has no team, so the team-based sub-task composer
        // doesn't apply — hidden for now (personal sub-tasks are a v2 item).
        isPersonal ? undefined : (
          <>
            <SubtaskSection
              query={{ parentId: task.id }}
              createLink={{ parentId: task.id, teamId: task.teamId }}
              composerTeams={team ? [{ id: team.id, name: team.name }] : []}
              defaultTeamId={task.teamId}
              onLinkExisting={() => setPickOpen(true)}
            />
            {pickOpen && (
              <PickIssueDialog
                open={pickOpen}
                onClose={() => setPickOpen(false)}
                subject={IssueKind.TASK}
                excludeIds={[task.id, ...childIds]}
                title={t('subtasks.linkTitle')}
                onPick={linkExisting}
                pending={update.isPending}
              />
            )}
          </>
        )
      }
      menuTarget={menuTarget}
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
                    remove.mutate(task.id, { onSuccess: onDeleted });
                },
              },
            ]
          : []
      }
      sidebar={
        <>
          <PropSection label={t('tasks.properties')}>
            <PropField bare label={t('tasks.status')}>
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
                <PropValue icon={<CircleDot />}>
                  <DotLabel color={statusCol?.color ?? 'hsl(var(--muted-foreground))'}>
                    {statusCol?.label ?? task.status}
                  </DotLabel>
                </PropValue>
              )}
            </PropField>

            {!isPersonal && (
              <PropField bare label={t('tasks.assignee')}>
                {canWrite ? (
                  <Combobox
                    leadingIcon={<CircleUser />}
                    value={task.assigneeId || ''}
                    onChange={(v) => save({ assigneeId: v })}
                    placeholder={t('tasks.unassigned')}
                    options={[
                      { value: '', label: t('tasks.unassigned') },
                      ...users.map((u) => ({ value: u.id, label: u.name })),
                    ]}
                  />
                ) : (
                  <PropValue icon={<CircleUser />} muted={!task.assigneeName}>
                    {task.assigneeName || t('tasks.unassigned')}
                  </PropValue>
                )}
              </PropField>
            )}

            <PropField bare label={t('tasks.dates')}>
              {canWrite ? (
                <DateRangePicker
                  start={task.startDate}
                  end={endDate}
                  onChange={(r) => save({ startDate: r.start, endDate: r.end })}
                  placeholder={t('tasks.setDates')}
                />
              ) : task.startDate || endDate ? (
                <PropValue
                  icon={<CalendarRange />}
                  className={cn(
                    endDate &&
                      endDate < todayStr() &&
                      task.status !== TaskStatus.DONE &&
                      'font-medium text-destructive',
                  )}
                >
                  {formatDateRange(task.startDate, endDate)}
                </PropValue>
              ) : (
                <PropValue icon={<CalendarRange />} muted>
                  {t('tasks.noDates')}
                </PropValue>
              )}
            </PropField>

            <PropField bare label={t('tasks.estimate')}>
              {canWrite ? (
                <Combobox
                  leadingIcon={<Gauge />}
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
                <PropValue icon={<Gauge />}>{taskEstimateLabel(task.estimate)}</PropValue>
              ) : (
                <PropValue icon={<Gauge />} muted>
                  {t('tasks.noEstimate')}
                </PropValue>
              )}
            </PropField>

            {!isPersonal && (
              <PropField bare label={t('tasks.backlogItem')}>
                {task.roadmapId ? (
                  <PropValue icon={<MapIcon />}>
                    <Link
                      to={`/roadmaps/${task.roadmapId}`}
                      className="block truncate font-medium underline-offset-4 hover:underline"
                      title={task.roadmapItemLabel || t('tasks.openRoadmaps')}
                    >
                      {task.roadmapItemLabel || t('tasks.openRoadmaps')}
                    </Link>
                  </PropValue>
                ) : (
                  <PropValue icon={<MapIcon />} muted>
                    {t('tasks.noBacklogItem')}
                  </PropValue>
                )}
              </PropField>
            )}

            <PropField bare label={t('tasks.created')}>
              <PropValue icon={<Clock />} muted>
                {task.createdByName || '—'} · {timeAgo(task.createdAt)}
              </PropValue>
            </PropField>

            {!isPersonal && (
              <CustomFields
                fields={teamCustomFields}
                values={task.customFields ?? {}}
                canWrite={canWrite}
                onChange={(next) => save({ customFields: next })}
              />
            )}
          </PropSection>

          {!isPersonal && (
            <PropSection label={t('labels.title')}>
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
            </PropSection>
          )}

          <IssueRelations subject={IssueKind.TASK} issueId={task.id} canWrite={canWrite} />
          {picker}
        </>
      }
    />
  );
}
