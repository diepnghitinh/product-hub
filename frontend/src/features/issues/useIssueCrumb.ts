import { t } from '@/i18n';
import { useTeams } from '@/features/teams/api';
import { IssueKind } from '@/types/enums';

/**
 * The middle breadcrumb an issue's page hangs under: **its own team's board**, so
 * a task and a bug read the same way —
 * `All issues › Engineering › TSK-…` and `All issues › QC › BUG-…`.
 * (The root crumb isn't ours: `/issues/<ref>` sits under All issues in the nav
 * model, which `Topbar` resolves via `findNavItem`.)
 *
 * Both kinds' detail pages call this instead of naming a parent themselves — a
 * bug's crumb used to say the literal word "Bugs" while a task's said its team,
 * so the same URL shape told you two different things depending on what you'd
 * clicked. One hook, one shape.
 *
 * Falls back to the kind's own list while `teams` is still loading, or when the
 * team can't be resolved at all (deleted since), so the crumb is never a dead
 * end. A private personal task belongs to no team and points at the Personal
 * board instead — it must never claim a team it isn't in.
 */
export function useIssueCrumbParent(
  kind: IssueKind,
  issue: { teamId?: string; ownerId?: string } | undefined,
): { to: string; label: string } {
  const { data: teams } = useTeams();
  const team = teams?.find((tm) => tm.id === issue?.teamId);

  if (issue?.ownerId) return { to: '/issues/personal', label: t('personal.title') };
  if (team) return { to: `/teams/${team.id}`, label: team.name };
  return kind === IssueKind.BUG
    ? { to: '/issues?kind=bug', label: t('bugs.title') }
    : { to: '/issues/me', label: t('tasks.assignedToMe') };
}
