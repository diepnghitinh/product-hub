import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarRange, Circle, CircleDot, CircleUser, Gauge, Map as MapIcon, Triangle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useEscapeBack } from '@/lib/useEscapeBack';
import {
  Button,
  Combobox,
  DateRangePicker,
  DotLabel,
  RichTextEditor,
  Select,
  Skeleton,
} from '@/components/ui';
import { t } from '@/i18n';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { Icon } from '@/components/Icon';
import { initials } from '@/lib/format';
import { useUsers } from '@/features/users/api';
import { PropField, PropSection } from '@/features/issues/IssueDetail';
import { useTeams, useTeamStatuses } from '@/features/teams/api';
import { TeamIconPicker } from '@/features/teams/TeamIconPicker';
import { useRoadmaps } from '@/features/roadmaps/api';
import { TASK_ESTIMATES, TeamIssueType, taskEstimateLabel } from '@/types/enums';
import { CenteredPageLayout } from '@/layouts/shared';
import { useCreateTask } from './api';

/**
 * Create a task on a full page that mirrors the task-detail layout: the same
 * main column (title + rich description) beside the same Properties sidebar, so
 * "New task" and an open task read as one screen.
 *
 * Everything is held in local draft state and written once on Create — nothing
 * persists until then, so the post-creation activity timeline (which needs a
 * real task to hang comments on) is replaced by a short hint in its place.
 */
export function NewTaskPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  useEscapeBack();

  // The column a "+ Add" came from, and the team whose board opened this — both
  // ride in on the query string so a task created here lands where you expect.
  // Missing teamId is correct on the team-less /tasks route (default task team).
  const teamId = searchParams.get('teamId') || undefined;
  const presetStatus = searchParams.get('status') || undefined;

  const create = useCreateTask();
  const { data: usersData } = useUsers({ limit: 100 });
  const users = usersData?.items ?? [];
  const { data: roadmaps } = useRoadmaps();
  // Columns of the team that will own the task (default task team when standalone).
  const columns = useTeamStatuses(teamId, TeamIssueType.TASK);

  // Draft — every field the detail sidebar exposes, editable before the task exists.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string | undefined>(presetStatus);
  const [assigneeId, setAssigneeId] = useState(user?.id ?? '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [estimate, setEstimate] = useState(0);
  const [itemId, setItemId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fall back to the first column so the Status select always shows a real value.
  const effectiveStatus = status ?? columns[0]?.key;

  // Breadcrumb + leading icon, identical to the detail page: the task's team
  // board when known, otherwise "My Tasks" with the current user's avatar.
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const team = teams?.find((tm) => tm.id === teamId);
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
    <span className="grid size-4 shrink-0 place-items-center rounded-full bg-primary text-[8px] font-semibold text-primary-foreground flex h-5 w-5 items-center justify-center rounded-sm">
      {initials(user.name, user.email)}
    </span>
  ) : (
    <span className="flex h-5 w-5 items-center justify-center rounded-sm">
      <Icon name="tasks" size={16} className="shrink-0" />
    </span>
  );

  // "No backlog item" first, then every roadmap item (roadmap-qualified for clarity).
  const itemOptions = useMemo(
    () => [
      { value: '', label: t('tasks.noBacklogItem') },
      ...(roadmaps ?? []).flatMap((r) =>
        (r.items ?? []).map((it) => ({
          value: it.id,
          label: `${r.title} · ${r.columns?.find((c) => c.key === it.phase)?.label ?? it.phase} · ${it.title}`,
        })),
      ),
    ],
    [roadmaps],
  );
  // itemId → the flat backlog link stored on the task (same shape the panel writes).
  const linkFor = useMemo(() => {
    const map = new Map<string, { roadmapId: string; projectId: string; label: string }>();
    (roadmaps ?? []).forEach((r) =>
      (r.items ?? []).forEach((it) =>
        map.set(it.id, {
          roadmapId: r.id,
          projectId: r.projectId,
          label: `${r.columns?.find((c) => c.key === it.phase)?.label ?? it.phase} · ${it.title}`,
        }),
      ),
    );
    return map;
  }, [roadmaps]);

  function submit() {
    if (!title.trim() || create.isPending) return;
    setError(null);
    const link = itemId ? linkFor.get(itemId) : undefined;
    create.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        status: effectiveStatus || undefined,
        // Sent so a team board's task lands in that team, not the workspace default.
        teamId,
        assigneeId: assigneeId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        estimate: estimate || undefined,
        roadmapItemId: itemId || undefined,
        roadmapItemLabel: link?.label,
        roadmapId: link?.roadmapId,
        projectId: link?.projectId,
      },
      {
        // Straight into the task we just made — replace, so Back skips the form.
        onSuccess: (task) => navigate(`/tasks/${task.shortId || task.id}`, { replace: true }),
        onError: (err) => setError((err as Error).message),
      },
    );
  }

  return (
    <CenteredPageLayout>
      <PageHeader
        title={t('tasks.new')}
        parent={parent}
        leading={leadingIcon}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => navigate(-1)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={submit} loading={create.isPending} disabled={!title.trim()}>
              {t('common.create')}
            </Button>
          </div>
        }
      />

      <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_260px]">
        {/* Main column — mirrors IssueDetailMain, minus the post-creation activity. */}
        <div className="min-w-0">
          {error && (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <input
            className="w-full min-w-0 border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground"
            value={title}
            placeholder={t('tasks.titleLabel')}
            aria-label={t('tasks.titleLabel')}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="mt-4">
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder={t('tasks.addDescription')}
              minHeight={80}
              images
              className="border-0"
            />
          </div>

          {/* Activity needs a real task; until then, name the section and say so. */}
          <section className="mt-10 border-t pt-6">
            <h2 className="mb-2 text-base font-semibold">{t('activity.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('tasks.activityAfterCreate')}</p>
          </section>
        </div>

        {/* Properties — the same sidebar the detail page shows, all editable. */}
        <aside className="flex flex-col gap-5 md:sticky md:top-6">
          <PropSection label={t('tasks.properties')}>
            <PropField label={t('tasks.status')} icon={<CircleDot />}>
              <Select
                value={effectiveStatus}
                onValueChange={setStatus}
                options={columns.map((c) => ({
                  value: c.key,
                  label: <DotLabel color={c.color}>{c.label}</DotLabel>,
                }))}
              />
            </PropField>

            <PropField label={t('tasks.assignee')} icon={<CircleUser />}>
              <Combobox
                value={assigneeId}
                onChange={setAssigneeId}
                placeholder={t('tasks.unassigned')}
                options={[
                  { value: '', label: t('tasks.unassigned') },
                  ...users.map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
            </PropField>

            <PropField label={t('tasks.dates')} icon={<CalendarRange />}>
              <DateRangePicker
                start={startDate}
                end={endDate}
                onChange={(r) => {
                  setStartDate(r.start);
                  setEndDate(r.end);
                }}
                placeholder={t('tasks.setDates')}
              />
            </PropField>

            <PropField label={t('tasks.estimate')} icon={<Gauge />}>
              <Combobox
                value={String(estimate || 0)}
                onChange={(v) => setEstimate(Number(v))}
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
            </PropField>

            <PropField label={t('tasks.backlogItem')} icon={<MapIcon />}>
              <Combobox
                value={itemId}
                onChange={setItemId}
                options={itemOptions}
                placeholder={t('tasks.noBacklogItem')}
              />
            </PropField>
          </PropSection>
        </aside>
      </div>
    </CenteredPageLayout>
  );
}
