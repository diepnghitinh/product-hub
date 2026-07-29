import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import {
  CYCLE_FILTER_CURRENT,
  CYCLE_FILTER_NONE,
  CYCLE_FILTER_UPCOMING,
  CycleMode,
  CycleStatus,
} from '@/types/enums';
import type { CycleBurndownDto, CycleDto, TeamDto } from '@/types/dto';

/** The rhythm fields of `PATCH /teams/:id/cycle-config` — all optional, only
 *  provided ones change. Bounds are enforced server-side (length 1–4, cooldown
 *  0–2, start day 1=Monday…7=Sunday, start date an ISO `YYYY-MM-DD` or null). */
export interface CycleConfigInput {
  cyclesEnabled?: boolean;
  /** `manual` stops generation and hands the calendar to the team; switching
   *  either way never deletes existing cycles. */
  cycleMode?: CycleMode;
  cycleLengthWeeks?: number;
  cycleCooldownWeeks?: number;
  cycleStartDay?: number;
  /** Explicit loop anchor (YYYY-MM-DD); null clears it back to the weekday. */
  cycleStartDate?: string | null;
  cycleAutoRollover?: boolean;
}

/** The editable half of a hand-planned cycle — what the create/edit dialog owns.
 *  Both dates are ISO `YYYY-MM-DD`, inclusive. */
export interface CycleInput {
  name?: string;
  startDate: string;
  endDate: string;
  description?: string | null;
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

/** Plan a cycle by hand. Manual-cadence teams only — the API rejects it on an
 *  auto team, whose calendar the scheduler owns. Overlapping another cycle's
 *  dates is also rejected (two cycles covering one day would both read
 *  "current"), and that error is the dialog's to surface. */
export function useCreateCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, input }: { teamId: string; input: CycleInput }) =>
      apiPost<CycleDto>(`/teams/${teamId}/cycles`, input),
    onSuccess: (_cycle, { teamId }) => {
      qc.invalidateQueries({ queryKey: ['cycles', teamId] });
    },
  });
}

/**
 * Edit a single cycle. `description` sets (or, as `null`, clears) the sprint
 * goal on any team; `name`/`startDate`/`endDate` re-schedule a hand-planned one
 * and are rejected on an auto team. Only the fields passed are sent, so the goal
 * editor can't accidentally move the dates. Invalidates the team's cycle list so
 * the insights drawer (which reads the cycle from that list) re-renders with the
 * saved text; the burn-up isn't affected, so it's left alone.
 */
export function useUpdateCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      teamId,
      cycleId,
      ...patch
    }: {
      teamId: string;
      cycleId: string;
    } & Partial<CycleInput>) =>
      apiPatch<CycleDto>(`/teams/${teamId}/cycles/${cycleId}`, patch),
    onSuccess: (_cycle, { teamId }) => {
      qc.invalidateQueries({ queryKey: ['cycles', teamId] });
    },
  });
}

/** Delete a hand-planned cycle (manual teams only). Its issues drop back to
 *  no-cycle server-side, so the boards have to re-read too. */
export function useDeleteCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, cycleId }: { teamId: string; cycleId: string }) =>
      apiDelete<{ ok: true }>(`/teams/${teamId}/cycles/${cycleId}`),
    onSuccess: (_res, { teamId }) => {
      qc.invalidateQueries({ queryKey: ['cycles', teamId] });
      qc.invalidateQueries({ queryKey: ['issues'] });
    },
  });
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
