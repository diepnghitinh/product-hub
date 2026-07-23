import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/lib/api';
import {
  CYCLE_FILTER_CURRENT,
  CYCLE_FILTER_NONE,
  CYCLE_FILTER_UPCOMING,
  CycleStatus,
} from '@/types/enums';
import type { CycleBurndownDto, CycleDto, TeamDto } from '@/types/dto';

/** The five rhythm fields of `PATCH /teams/:id/cycle-config` — all optional,
 *  only provided ones change. Bounds are enforced server-side (length 1–4,
 *  cooldown 0–2, start day 1=Monday…7=Sunday). */
export interface CycleConfigInput {
  cyclesEnabled?: boolean;
  cycleLengthWeeks?: number;
  cycleCooldownWeeks?: number;
  cycleStartDay?: number;
  cycleAutoRollover?: boolean;
}

/**
 * A team's cycles, newest-first. The read itself advances the lazy scheduler
 * server-side (there is no cron) — looking at cycles is what rolls them, so a
 * consumer never has to "refresh" past a boundary.
 */
export function useCycles(teamId: string | undefined) {
  return useQuery({
    queryKey: ['cycles', teamId],
    queryFn: () => apiGet<CycleDto[]>(`/teams/${teamId}/cycles`),
    enabled: !!teamId,
  });
}

/**
 * A cycle's burn-up: the reconstructed daily series + breakdowns for the
 * insights drawer. Its own cache key (`cycle-burndown`) so opening the drawer
 * doesn't disturb the cycle list; kept fresh a short while since the series
 * moves as issues change. `enabled` gates it to when the drawer is open.
 */
export function useCycleBurndown(
  teamId: string | undefined,
  cycleId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ['cycle-burndown', teamId, cycleId],
    queryFn: () => apiGet<CycleBurndownDto>(`/teams/${teamId}/cycles/${cycleId}/burndown`),
    enabled: enabled && !!teamId && !!cycleId,
    staleTime: 30_000,
  });
}

/**
 * The single cycle a board's `?cycle=` scope points at, as a full DTO — for
 * DISPLAY (the board's cycle banner). Sentinels resolve against the team:
 * `current`→the active cycle, `upcoming`→the soonest upcoming, an id→that cycle.
 * `none`/All-cycles/a not-yet-loaded id → undefined, i.e. "no one cycle to
 * feature" (the banner then renders nothing). Contrast `useResolvedCycleId`,
 * which is for WRITES and falls back to the raw id before the list loads.
 */
export function useFocusedCycle(
  team: TeamDto | undefined,
  param: string,
): CycleDto | undefined {
  const enabled = !!team?.cyclesEnabled;
  const { data: cycles } = useCycles(enabled ? team?.id : undefined);
  if (!enabled || !param || param === CYCLE_FILTER_NONE) return undefined;
  if (param === CYCLE_FILTER_CURRENT) {
    return cycles?.find((c) => c.status === CycleStatus.ACTIVE);
  }
  if (param === CYCLE_FILTER_UPCOMING) {
    // Newest-first ⇒ the soonest upcoming cycle is the last upcoming in the list.
    return [...(cycles ?? [])].reverse().find((c) => c.status === CycleStatus.UPCOMING);
  }
  return cycles?.find((c) => c.id === param);
}

/**
 * Resolve a board's `?cycle=` value (a cycle id or a `current`/`upcoming`/`none`
 * sentinel) to a concrete cycle id a WRITE can carry — creating from a filtered
 * board must land the issue in that cycle, or the card "saves" and instantly
 * vanishes from the view (the `teamId` pitfall all over again). Sentinels
 * resolve against the already-cached cycle list; `none`/no-match → undefined.
 */
export function useResolvedCycleId(
  team: TeamDto | undefined,
  param: string,
): string | undefined {
  const enabled = !!team?.cyclesEnabled;
  const { data: cycles } = useCycles(enabled ? team?.id : undefined);
  if (!enabled || !param || param === CYCLE_FILTER_NONE) return undefined;
  if (param === CYCLE_FILTER_CURRENT) {
    return cycles?.find((c) => c.status === CycleStatus.ACTIVE)?.id;
  }
  if (param === CYCLE_FILTER_UPCOMING) {
    // Newest-first ⇒ the soonest upcoming cycle is the last upcoming in the list.
    return [...(cycles ?? [])].reverse().find((c) => c.status === CycleStatus.UPCOMING)?.id;
  }
  return param;
}

/** Patch a team's cycle rhythm. Enabling seeds current + 2 upcoming cycles;
 *  disabling deletes the upcoming ones (their issues drop back to no-cycle);
 *  re-rhythming an enabled team regenerates the upcoming ones. Invalidates
 *  issues too — a rhythm change can move issues between cycles server-side. */
export function useUpdateCycleConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CycleConfigInput }) =>
      apiPatch<TeamDto>(`/teams/${id}/cycle-config`, input),
    onSuccess: (_team, { id }) => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['cycles', id] });
      qc.invalidateQueries({ queryKey: ['issues'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['bugs'] });
    },
  });
}
