import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';
import type { TeamDto } from '@/types/dto';
import { defaultStatusesFor } from '@/types/enums';
import type { TeamIssueType, TeamStatusConfig } from '@/types/enums';

/** All teams incl. archived — the nav filters archived out; settings shows them. */
export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: () => apiGet<TeamDto[]>('/teams'),
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; issueType: TeamIssueType; icon?: string; color?: string | null }) =>
      apiPost<TeamDto>('/teams', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { name?: string; archived?: boolean; icon?: string; color?: string | null };
    }) =>
      apiPatch<TeamDto>(`/teams/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

/** Replace a team's board columns (built-ins can be reordered, not removed). */
export function useUpdateTeamStatuses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, statuses }: { id: string; statuses: TeamStatusConfig[] }) =>
      apiPut<TeamDto>(`/teams/${id}/statuses`, { statuses }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

/**
 * The board columns for a team. Teams are already cached for the nav, so this
 * costs no extra request.
 *
 * `teamId` wins when given (a team board, or an issue via its `teamId`).
 * Otherwise falls back to the default team for `issueType` — that's what the
 * team-less `/bugs` and `/tasks` routes render. Code defaults are the last
 * resort, before teams have loaded.
 */
export function useTeamStatuses(
  teamId: string | undefined,
  issueType: TeamIssueType,
): TeamStatusConfig[] {
  return useTeamStatusesLookup()(teamId, issueType);
}

/**
 * Same resolution, as a function — for lists whose rows belong to different
 * teams (e.g. the tasks under a backlog item), where a hook per row isn't legal.
 */
export function useTeamStatusesLookup(): (
  teamId: string | undefined,
  issueType: TeamIssueType,
) => TeamStatusConfig[] {
  const { data: teams } = useTeams();
  return (teamId, issueType) => {
    const team = teamId
      ? teams?.find((t) => t.id === teamId)
      : teams?.find((t) => t.issueType === issueType && t.isDefault);
    return team?.statuses?.length ? team.statuses : defaultStatusesFor(issueType);
  };
}
