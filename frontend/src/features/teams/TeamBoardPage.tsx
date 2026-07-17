import { Link, useParams } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { t } from '@/i18n';
import { TeamIssueType } from '@/types/enums';
import { BugsBoardPage } from '@/features/bugs/BugsBoardPage';
import { MyTasksPage } from '@/features/tasks/MyTasksPage';
import { useTeams } from './api';

/**
 * A team's issue list. A team owns exactly one issue type, so this resolves the
 * team then renders that type's board scoped to it — QC → bugs, Engineering →
 * tasks, and the same for any custom team by its `issueType`.
 */
export function TeamBoardPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { data: teams, isLoading } = useTeams();

  if (isLoading) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed p-8">
        <Spinner />
      </div>
    );
  }

  const team = (teams ?? []).find((x) => x.id === teamId || x.key === teamId);
  if (!team) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        {t('teams.notFound')}{' '}
        <Link to="/" className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
          {t('nav.home')}
        </Link>
      </div>
    );
  }

  return team.issueType === TeamIssueType.BUG ? (
    <BugsBoardPage teamId={team.id} teamName={team.name} />
  ) : (
    <MyTasksPage teamId={team.id} teamName={team.name} />
  );
}
