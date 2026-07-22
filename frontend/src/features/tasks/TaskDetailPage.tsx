import { useNavigate, useParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useEscapeBack } from '@/lib/useEscapeBack';
import { Skeleton } from '@/components/ui';
import { t } from '@/i18n';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { Icon } from '@/components/Icon';
import { initials } from '@/lib/format';
import { useTeams } from '@/features/teams/api';
import { TeamIconPicker } from '@/features/teams/TeamIconPicker';
import { useTask } from './api';
import { TaskDetail } from './components/TaskDetail';
import { CenteredPageLayout } from '@/layouts/shared';

/** One task's detail route: the breadcrumb chrome around the shared, embeddable
 * <TaskDetail> (which also renders inside a sub-task peek drawer). Mirrors
 * BugDetailPage → BugDetail. */
export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  useEscapeBack();

  // Fetched only for the crumb (title + team); <TaskDetail> re-reads the same
  // query (React Query dedupes it) for the body.
  const { data: task } = useTask(taskId);

  // Breadcrumb parent: the task's own team board when resolvable, so the crumb
  // tells you which team the task belongs to — falls back to "My Tasks" if the
  // task has no resolvable team. The leading icon follows suit: a skeleton
  // while teams are still loading (never a guessed icon), the team's own
  // symbol once resolved, or — for a genuinely team-less task — the current
  // user's own avatar, matching the sidebar's "Assigned to me" treatment.
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const team = teams?.find((tm) => tm.id === task?.teamId);
  // A private personal task belongs to no team — its crumb points back to the
  // Personal board, not a team, and never says "My Tasks".
  const isPersonal = !!task?.ownerId;
  const parent = isPersonal
    ? { to: '/issues/personal', label: t('personal.title') }
    : team
    ? { to: `/teams/${team.id}`, label: team.name }
    : { to: '/issues', label: t('tasks.assignedToMe') };
  const leadingIcon = isPersonal ? (
    <span className="flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent/60 hover:text-accent-foreground">
      <Lock size={16} className="shrink-0 text-muted-foreground" />
    </span>
  ) : teamsLoading ? (
    <Skeleton className="size-4 shrink-0 rounded-full" />
  ) : team ? (
    <span className="flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent/60 hover:text-accent-foreground">
      <TeamIconPicker team={team} readOnly size={16} className="shrink-0 text-muted-foreground" />
    </span>
  ) : user ? (
    <span className="grid size-4 shrink-0 place-items-center rounded-full bg-primary text-[8px] font-semibold text-primary-foreground flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent/60 hover:text-accent-foreground">
      {initials(user.name, user.email)}
    </span>
  ) : (
    <span className="flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent/60 hover:text-accent-foreground">
      <Icon name="tasks" size={16} className="shrink-0" />
    </span>
  );

  return (
    <CenteredPageLayout>
      {/* Breadcrumb (My Tasks › TSK-7) — tasks aren't in the nav model, so the
          parent is named here. */}
      <PageHeader
        title={task?.shortId || task?.title || taskId || ''}
        parent={parent}
        leading={leadingIcon}
      />

      <TaskDetail
        taskId={taskId}
        menuTarget="topbar"
        onDeleted={() => navigate(isPersonal ? '/issues/personal' : '/issues')}
      />
    </CenteredPageLayout>
  );
}
