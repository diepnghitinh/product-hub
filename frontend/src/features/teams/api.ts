import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';
import { t } from '@/i18n';
import type { TeamDto } from '@/types/dto';
import { defaultStatusesFor } from '@/types/enums';
import type {
  CustomFieldConfig,
  TaskLabelConfig,
  TeamIssueType,
  TeamStatusConfig,
} from '@/types/enums';

/** All teams incl. archived — the nav filters archived out; settings shows them.
 *  `enabled` lets an authenticated-only consumer (e.g. a lookup a public page
 *  opts out of) skip the request rather than fire it and ignore a 401. */
export function useTeams(enabled = true) {
  return useQuery({
    queryKey: ['teams'],
    queryFn: () => apiGet<TeamDto[]>('/teams'),
    enabled,
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

/**
 * Replace a team's board columns (built-ins can be reordered, not removed).
 *
 * Optimistic, because this is what a column drag on a board writes: the board
 * reads its columns straight from this cache, so without it the column springs
 * back to where it was for the length of the round trip. The Settings editor
 * saves the same way and simply doesn't notice — it's already showing its own
 * draft. On failure the snapshot goes back and the caller reports it.
 */
export function useUpdateTeamStatuses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, statuses }: { id: string; statuses: TeamStatusConfig[] }) =>
      apiPut<TeamDto>(`/teams/${id}/statuses`, { statuses }),
    onMutate: async ({ id, statuses }) => {
      await qc.cancelQueries({ queryKey: ['teams'] });
      const teams = qc.getQueryData<TeamDto[]>(['teams']);
      qc.setQueryData<TeamDto[]>(['teams'], (old) =>
        old?.map((team) => (team.id === id ? { ...team, statuses } : team)),
      );
      return { teams };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.teams) qc.setQueryData(['teams'], ctx.teams);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

/**
 * A team board's `onColumnsReorder` — dragging a column writes the team's
 * statuses, the same config Settings → Teams edits, so the board and that screen
 * can never disagree about the order.
 *
 * `undefined` when there's no single team behind the board (the standalone
 * `/tasks` and `/bugs` routes span teams and merely *borrow* the default team's
 * columns — there'd be no honest place to save an order). Callers add their own
 * permission gate; the endpoint behind this is `@Roles(ADMIN, PRODUCT)`.
 */
export function useReorderTeamColumns(teamId: string | undefined) {
  const save = useUpdateTeamStatuses();
  if (!teamId) return undefined;
  return (statuses: TeamStatusConfig[]) =>
    save.mutate(
      { id: teamId, statuses },
      // The optimistic order is already on screen, so a silent failure would
      // read as saved — right up until the next reload put it back.
      {
        onError: (e) =>
          toast.error(t('board.reorderColumnFailed'), { description: (e as Error).message }),
      },
    );
}

/** Replace a team's item labels (shared by its tasks/bugs; an empty list clears them). */
export function useUpdateTeamLabels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, labels }: { id: string; labels: TaskLabelConfig[] }) =>
      apiPut<TeamDto>(`/teams/${id}/labels`, { labels }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

/** Replace a team's custom fields (shared by its tasks/bugs; an empty list clears them). */
export function useUpdateTeamCustomFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, customFields }: { id: string; customFields: CustomFieldConfig[] }) =>
      apiPut<TeamDto>(`/teams/${id}/custom-fields`, { customFields }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

/** Toggle a team board's public read-only link (mints/keeps the token server-side). */
export function useSetTeamSharing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiPost<TeamDto>(`/teams/${id}/share`, { enabled }),
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
 * `enabled=false` skips the `/teams` fetch entirely — for a caller (e.g. a
 * public page) that already has its one team's statuses and supplies its own
 * lookup instead.
 */
export function useTeamStatusesLookup(enabled = true): (
  teamId: string | undefined,
  issueType: TeamIssueType,
) => TeamStatusConfig[] {
  const { data: teams } = useTeams(enabled);
  return (teamId, issueType) => {
    const team = teamId
      ? teams?.find((t) => t.id === teamId)
      : teams?.find((t) => t.issueType === issueType && t.isDefault);
    return team?.statuses?.length ? team.statuses : defaultStatusesFor(issueType);
  };
}

/**
 * A team's item labels (shared by its tasks/bugs). Unlike statuses there are no
 * code defaults — an empty list is the expected start — so this just reads the
 * team's own set. Teams are already cached for the nav, so it costs no request.
 */
export function useTeamLabels(teamId: string | undefined): TaskLabelConfig[] {
  return useTeamLabelsLookup()(teamId);
}

/**
 * Same resolution, as a function — for boards/lists whose rows can belong to
 * different teams (e.g. "assigned to me"), where a hook per row isn't legal.
 * Resolve each card against its own item's `teamId`.
 */
export function useTeamLabelsLookup(): (teamId: string | undefined) => TaskLabelConfig[] {
  const { data: teams } = useTeams();
  return (teamId) => teams?.find((t) => t.id === teamId)?.labels ?? [];
}

/**
 * A team's custom fields (shared by its tasks/bugs). Like labels there are no code
 * defaults — an empty list is the expected start — so it just reads the team's set.
 */
export function useTeamCustomFields(teamId: string | undefined): CustomFieldConfig[] {
  return useTeamCustomFieldsLookup()(teamId);
}

/** Same resolution as a function — for lists whose rows span teams. */
export function useTeamCustomFieldsLookup(): (teamId: string | undefined) => CustomFieldConfig[] {
  const { data: teams } = useTeams();
  return (teamId) => teams?.find((t) => t.id === teamId)?.customFields ?? [];
}
