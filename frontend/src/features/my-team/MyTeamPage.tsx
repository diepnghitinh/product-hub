import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Select, Spinner } from '@/components/ui';
import { BOARD_GUTTER, IssueBoardLayout } from '@/components/IssueBoardLayout';
import { useIssues } from '@/features/issues/api';
import { useTeams, useTeamStatuses } from '@/features/teams/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { IssueKind, TeamIssueType } from '@/types/enums';
import { TeamWorkloadView } from './TeamWorkloadView';
import { groupByPerson } from './workload';

/** Switcher value that aggregates every task team into one workload (teamId undefined). */
const ALL_TEAMS = 'all';

/**
 * "My Team" — the team's queue seen *by person*, sitting right under My Tasks
 * (mine → my team's). A single **Box** lens: a grid of per-person workload cards
 * (counts, share complete, story points, and their issues grouped by status). The
 * app has no membership model, so "people" are whoever is assigned to the team's
 * issues — see `groupByPerson`.
 *
 * Works for any team — a QC bug team as much as an Engineering task team: data comes
 * from the unified `/issues` API, and each board resolves its own columns and "done"
 * from its `issueType`. The team is chosen with a switcher that rides the URL
 * (`?team=`) so a view is shareable and survives reload, like every other board here.
 * "All teams" stays a task aggregate — bug boards have no comparable column vocabulary
 * to merge — so bug teams are viewed one at a time.
 */
export function MyTeamPage() {
  const { canEditDelivery: canWrite, canManageDelivery } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: teams, isLoading: teamsLoading } = useTeams();
  // Every active team can have a per-person workload — task teams and bug (QC)
  // teams alike. Kind only changes each board's columns + create flow, below.
  const workloadTeams = (teams ?? [])
    .filter((x) => !x.archived)
    .sort((a, b) => a.order - b.order);

  const teamParam = searchParams.get('team');
  const explicitTeam =
    teamParam && teamParam !== ALL_TEAMS ? workloadTeams.find((x) => x.id === teamParam) : undefined;
  // Default lens is the "All teams" task aggregate whenever there's more than one team
  // to aggregate (i.e. the switcher is shown); a lone team defaults to its own workload
  // so a single bug team still renders instead of an empty task aggregate. An explicit,
  // existing `?team=<id>` always wins; `?team=all` and stale ids resolve to All teams.
  // "All teams" leaves teamId undefined, so the issue query spans every task team.
  const isAllTeams = explicitTeam ? false : teamParam === ALL_TEAMS || workloadTeams.length > 1;
  const activeTeam = isAllTeams ? undefined : explicitTeam ?? workloadTeams[0];
  const teamId = activeTeam?.id;
  // ALL_TEAMS has no single kind — it aggregates task teams, so read task columns.
  const activeIssueType = activeTeam?.issueType ?? TeamIssueType.TASK;
  const activeKind = activeIssueType === TeamIssueType.BUG ? IssueKind.BUG : IssueKind.TASK;
  // A task is only meaningful on a task board (bugs are added on their own board);
  // "All teams" is a task aggregate, so it can create too.
  const canCreateHere = isAllTeams || activeTeam?.issueType === TeamIssueType.TASK;

  const setTeam = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('team', value);
    else next.delete('team');
    setSearchParams(next, { replace: true });
  };

  const columns = useTeamStatuses(teamId, activeIssueType);
  // A specific team → its own issues (a bug team returns bugs). "All teams" → every
  // task team's issues. Passing `kind` keeps the fetch to the one endpoint that
  // applies (so a bug board doesn't also pull tasks, and vice versa).
  const { data, isLoading } = useIssues(isAllTeams ? { kind: [IssueKind.TASK] } : { teamId, kind: [activeKind] });
  const issues = data?.items ?? [];

  const people = useMemo(
    () => groupByPerson(issues, columns, t('myteam.unassigned')),
    [issues, columns],
  );

  // Always carry the board's teamId so the draft opens in *this* team — the API
  // otherwise files it under the default team.
  const newTaskHref = () => {
    const params = new URLSearchParams();
    if (teamId) params.set('teamId', teamId);
    const qs = params.toString();
    return `/tasks/new${qs ? `?${qs}` : ''}`;
  };

  // No teams at all — nothing to show a workload for.
  if (!teamsLoading && workloadTeams.length === 0) {
    return (
      <IssueBoardLayout title={t('myteam.title')} subtitle={t('myteam.subtitle')}>
        <div className="mx-4 rounded-xl border border-dashed p-8 text-center md:mx-8">
          <p className="text-muted-foreground">{t('myteam.noTeams')}</p>
          {canManageDelivery && (
            <Button asChild size="sm" className="mt-3">
              <Link to="/admin/settings">{t('myteam.noTeamsAction')}</Link>
            </Button>
          )}
        </div>
      </IssueBoardLayout>
    );
  }

  return (
    <IssueBoardLayout
      title={t('myteam.title')}
      subtitle={t('myteam.subtitle')}
      filters={
        workloadTeams.length > 1 ? (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm text-muted-foreground">{t('myteam.team')}</span>
            <Select
              value={isAllTeams ? ALL_TEAMS : teamId ?? ''}
              onValueChange={setTeam}
              options={[
                { value: ALL_TEAMS, label: t('myteam.allTeams') },
                ...workloadTeams.map((x) => ({ value: x.id, label: x.name })),
              ]}
              className="min-w-[10rem]"
            />
          </div>
        ) : undefined
      }
      actions={
        canWrite && canCreateHere ? (
          <Button onClick={() => navigate(newTaskHref())}>+ {t('tasks.new')}</Button>
        ) : undefined
      }
    >
      {isLoading || teamsLoading ? (
        <div className={cn('grid place-items-center rounded-xl border border-dashed p-8', BOARD_GUTTER)}>
          <Spinner />
        </div>
      ) : people.length === 0 ? (
        <div className="mx-4 rounded-xl border border-dashed p-8 text-center md:mx-8">
          <p className="text-muted-foreground">{t('myteam.noPeople')}</p>
          {canWrite && canCreateHere && (
            <Button size="sm" className="mt-3" onClick={() => navigate(newTaskHref())}>
              {t('tasks.new')}
            </Button>
          )}
        </div>
      ) : (
        <div className={cn('min-h-0 flex-1 overflow-y-auto pb-4 pt-1', BOARD_GUTTER)}>
          <TeamWorkloadView people={people} />
        </div>
      )}
    </IssueBoardLayout>
  );
}
