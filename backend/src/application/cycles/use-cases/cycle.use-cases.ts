import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ITeamRepository } from '@application/teams/repositories/team.repository';
import { TeamEntity } from '@application/teams/domain/entities/team.entity';
import { TEAM_NOT_FOUND } from '@application/teams/use-cases/team.use-cases';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import {
  CreateCycleDto,
  CycleBurndownResponseDto,
  CycleResponseDto,
  UpdateCycleDto,
  UpdateTeamCycleConfigDto,
} from '../dtos/cycle.dtos';
import { CycleEntity } from '../domain/entities/cycle.entity';
import { CycleMapper } from '../mappers/cycle.mapper';
import { completedStatusKeysFor } from '../domain/enums/cycle.enums';
import { buildBurndown } from '../domain/cycle-burndown';
import { todayISO } from '../domain/cycle-dates';
import { ICycleRepository } from '../repositories/cycle.repository';
import { CycleSchedulerService } from '../services/cycle-scheduler.service';

/** A cycle id that doesn't exist (or belongs to another team). */
export const CYCLE_NOT_FOUND = 'Cycle not found';
/** Hand-planning a cycle is only on offer to a team that opted out of the rhythm. */
export const CYCLES_NOT_MANUAL = 'This team generates its cycles automatically';
/** Cycles are turned off entirely — there is no calendar to add to. */
export const CYCLES_DISABLED = 'Cycles are turned off for this team';

/**
 * The team's other cycles that share a day with `[start, end]`. Both windows are
 * inclusive, so touching ends overlap. Two cycles covering the same day would
 * both derive ACTIVE, and every "the current cycle" answer in the app — the
 * `?cycle=current` filter, new-issue auto-add, the rollover target — silently
 * picks one of them. Rejecting the overlap is what keeps that answer singular.
 */
function overlapping(cycles: CycleEntity[], start: string, end: string, exceptId?: string) {
  return cycles.filter(
    (c) => c.id.toString() !== exceptId && start <= c.endDate && end >= c.startDate,
  );
}

/** How an overlap is reported back — names the cycle it collides with. */
function overlapError(clash: CycleEntity): string {
  const label = clash.name ? `${clash.name} (Cycle ${clash.number})` : `Cycle ${clash.number}`;
  return `Those dates overlap ${label}: ${clash.startDate} – ${clash.endDate}`;
}

/**
 * A team's cycles, newest-first. Runs the scheduler first (this read is what
 * advances the clock), then fills live rollups for every not-yet-closed cycle;
 * closed ones keep their frozen history. Still works when cycles are disabled —
 * history stays readable, generation just stopped.
 */
@Injectable()
export class GetTeamCyclesUseCase
  implements IUsecaseExecute<{ tenantId: string; teamId: string }, Result<CycleResponseDto[]>>
{
  constructor(
    @Inject(ITeamRepository) private readonly teams: ITeamRepository,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    private readonly scheduler: CycleSchedulerService,
  ) {}

  async execute({
    tenantId,
    teamId,
  }: {
    tenantId: string;
    teamId: string;
  }): Promise<Result<CycleResponseDto[]>> {
    const team = await this.teams.findById(tenantId, teamId);
    if (!team) return Result.fail(TEAM_NOT_FOUND);

    const today = todayISO();
    const cycles = await this.scheduler.ensureCyclesCurrent(team, today);

    const openIds = cycles.filter((c) => !c.isClosed).map((c) => c.id.toString());
    const live = openIds.length
      ? await this.issues.cycleRollups(tenantId, openIds, completedStatusKeysFor(team.issueType))
      : {};

    // Newest *window* first, not highest number: a manual team numbers cycles in
    // the order it created them, so number order needn't be chronological. The
    // list renders the cooldown gap between adjacent rows, which only reads right
    // when they're in date order. Number breaks ties (same window, created apart).
    const dtos = cycles
      .slice()
      .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.number - a.number)
      .map((c) => CycleMapper.toResponseDto(c, today, live[c.id.toString()]));
    return Result.ok(dtos);
  }
}

/**
 * A single cycle's burn-up: the daily scope/started/completed series plus the
 * per-assignee/label/project breakdown. The series is *reconstructed* from issue
 * timestamps (`createdAt` for scope, `updatedAt` for started/completed) — there's
 * no status history — so it reads as "best known", not an audited log. The chart
 * colours come from the team's own board columns so it matches the board's dots.
 */
@Injectable()
export class GetCycleBurndownUseCase
  implements
    IUsecaseExecute<
      { tenantId: string; teamId: string; cycleId: string },
      Result<CycleBurndownResponseDto>
    >
{
  constructor(
    @Inject(ITeamRepository) private readonly teams: ITeamRepository,
    @Inject(ICycleRepository) private readonly cycles: ICycleRepository,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
  ) {}

  async execute({
    tenantId,
    teamId,
    cycleId,
  }: {
    tenantId: string;
    teamId: string;
    cycleId: string;
  }): Promise<Result<CycleBurndownResponseDto>> {
    const team = await this.teams.findById(tenantId, teamId);
    if (!team) return Result.fail(TEAM_NOT_FOUND);

    const cycle = await this.cycles.findById(tenantId, cycleId);
    if (!cycle || cycle.teamId !== teamId) return Result.fail(CYCLE_NOT_FOUND);

    const completedKeys = completedStatusKeysFor(team.issueType);
    const statuses = team.statuses;
    // "Not started" is exactly the first board column; everything past it counts
    // as started. The chart's colours borrow the team's own started/done columns.
    const unstartedKey = statuses[0]?.key ?? '';
    const completedCol = statuses.find((s) => completedKeys.includes(s.key));
    const startedCol = statuses.find((s) => s.key !== unstartedKey);
    const labelLookup = Object.fromEntries(
      team.labels.map((l) => [l.key, { name: l.name, color: l.color }]),
    );

    const rows = await this.issues.issuesForBurndown(tenantId, cycleId, cycle.unfinishedIds);
    const result = buildBurndown({
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      rows,
      completedKeys,
      unstartedKey,
      labelLookup,
    });

    return Result.ok({
      cycleId: cycle.id.toString(),
      number: cycle.number,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      status: cycle.statusOn(todayISO()),
      unit: result.unit,
      scopeCount: result.scopeCount,
      scopePoints: result.scopePoints,
      startedCount: result.startedCount,
      startedPoints: result.startedPoints,
      completedCount: result.completedCount,
      completedPoints: result.completedPoints,
      startedColor: startedCol?.color ?? completedCol?.color ?? '',
      completedColor: completedCol?.color ?? '',
      series: result.series,
      assignees: result.assignees,
      labels: result.labels,
      projects: result.projects,
    });
  }
}

/**
 * Plan a cycle by hand. Manual teams only — on an `auto` team the scheduler owns
 * the calendar and a hand-made cycle would be wiped by the next rhythm change
 * anyway. The number is just the next one up (identity and a fallback label);
 * the *dates* are what order the list, so numbering out of chronological order
 * is expected here, not a bug.
 */
@Injectable()
export class CreateCycleUseCase
  implements
    IUsecaseExecute<
      { tenantId: string; teamId: string; dto: CreateCycleDto },
      Result<CycleResponseDto>
    >
{
  constructor(
    @Inject(ITeamRepository) private readonly teams: ITeamRepository,
    @Inject(ICycleRepository) private readonly cycles: ICycleRepository,
  ) {}

  async execute({
    tenantId,
    teamId,
    dto,
  }: {
    tenantId: string;
    teamId: string;
    dto: CreateCycleDto;
  }): Promise<Result<CycleResponseDto>> {
    const team = await this.teams.findById(tenantId, teamId);
    if (!team) return Result.fail(TEAM_NOT_FOUND);
    if (!team.cyclesEnabled) return Result.fail(CYCLES_DISABLED);
    if (!team.cyclesManual) return Result.fail(CYCLES_NOT_MANUAL);

    const existing = await this.cycles.findByTeam(tenantId, teamId);
    const clash = overlapping(existing, dto.startDate, dto.endDate)[0];
    if (clash) return Result.fail(overlapError(clash));

    const created = CycleEntity.create({
      tenantId,
      teamId,
      number: existing.reduce((max, c) => Math.max(max, c.number), 0) + 1,
      name: dto.name,
      startDate: dto.startDate,
      endDate: dto.endDate,
      description: dto.description ?? null,
    });
    if (created.isFailure) return Result.fail(created.error as string);

    const cycle = created.getValue();
    // The unique `(teamId, number)` index is the only thing serialising two
    // people planning at once; a lost race means the number was taken, not that
    // the cycle exists (unlike generation, these aren't the same cycle).
    const inserted = await this.cycles.insert(cycle);
    if (!inserted) return Result.fail('Another cycle was just created — try again');

    // Brand new, so nothing to roll up: every count is 0 until issues join it.
    return Result.ok(CycleMapper.toResponseDto(cycle, todayISO()));
  }
}

/**
 * Edit a single cycle. The goal/notes — the Scrum "sprint goal" — can be set on
 * any cycle of any team (upcoming, active, or closed history alike); it's a
 * note, not a stat, so closed cycles aren't frozen against it. The name and the
 * date window are manual-team-only, since on an auto team the scheduler would
 * just overwrite them. The reply carries live rollups for a still-open cycle,
 * exactly like the list read, so the client can drop the fresh DTO straight into
 * its cache.
 */
@Injectable()
export class UpdateCycleUseCase
  implements
    IUsecaseExecute<
      { tenantId: string; teamId: string; cycleId: string; dto: UpdateCycleDto },
      Result<CycleResponseDto>
    >
{
  constructor(
    @Inject(ITeamRepository) private readonly teams: ITeamRepository,
    @Inject(ICycleRepository) private readonly cycles: ICycleRepository,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
  ) {}

  async execute({
    tenantId,
    teamId,
    cycleId,
    dto,
  }: {
    tenantId: string;
    teamId: string;
    cycleId: string;
    dto: UpdateCycleDto;
  }): Promise<Result<CycleResponseDto>> {
    const team = await this.teams.findById(tenantId, teamId);
    if (!team) return Result.fail(TEAM_NOT_FOUND);

    const cycle = await this.cycles.findById(tenantId, cycleId);
    if (!cycle || cycle.teamId !== teamId) return Result.fail(CYCLE_NOT_FOUND);

    const reschedules =
      dto.name !== undefined || dto.startDate !== undefined || dto.endDate !== undefined;
    if (reschedules) {
      if (!team.cyclesManual) return Result.fail(CYCLES_NOT_MANUAL);

      const startDate = dto.startDate ?? cycle.startDate;
      const endDate = dto.endDate ?? cycle.endDate;
      const siblings = await this.cycles.findByTeam(tenantId, teamId);
      const clash = overlapping(siblings, startDate, endDate, cycleId)[0];
      if (clash) return Result.fail(overlapError(clash));

      const moved = cycle.reschedule({ name: dto.name, startDate, endDate });
      if (moved.isFailure) return Result.fail(moved.error as string);
      await this.cycles.saveSchedule(cycle);
    }

    if (dto.description !== undefined) {
      cycle.setDescription(dto.description);
      await this.cycles.setDescription(tenantId, cycleId, cycle.description);
    }

    const today = todayISO();
    // Mirror the list read: an open cycle shows live rollups, a closed one its
    // frozen history — so the returned DTO matches what a re-list would show.
    const live = cycle.isClosed
      ? undefined
      : (await this.issues.cycleRollups(tenantId, [cycleId], completedStatusKeysFor(team.issueType)))[
          cycleId
        ];
    return Result.ok(CycleMapper.toResponseDto(cycle, today, live));
  }
}

/**
 * Delete a hand-planned cycle. Manual teams only — on an auto team the scheduler
 * would just mint it again on the next read, so the delete would look like it
 * silently failed. Its issues fall back to no-cycle rather than being deleted or
 * moved: they're real work, and where they go next is the team's call.
 *
 * Deleting a *completed* cycle is allowed and does throw away its frozen stats —
 * that history exists nowhere else. Numbers aren't reused; the next cycle
 * continues from the highest ever used, so a gap in the numbering is normal.
 */
@Injectable()
export class DeleteCycleUseCase
  implements
    IUsecaseExecute<{ tenantId: string; teamId: string; cycleId: string }, Result<void>>
{
  constructor(
    @Inject(ITeamRepository) private readonly teams: ITeamRepository,
    @Inject(ICycleRepository) private readonly cycles: ICycleRepository,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
  ) {}

  async execute({
    tenantId,
    teamId,
    cycleId,
  }: {
    tenantId: string;
    teamId: string;
    cycleId: string;
  }): Promise<Result<void>> {
    const team = await this.teams.findById(tenantId, teamId);
    if (!team) return Result.fail(TEAM_NOT_FOUND);
    if (!team.cyclesManual) return Result.fail(CYCLES_NOT_MANUAL);

    const cycle = await this.cycles.findById(tenantId, cycleId);
    if (!cycle || cycle.teamId !== teamId) return Result.fail(CYCLE_NOT_FOUND);

    const removed = await this.cycles.deleteById(tenantId, cycleId);
    if (!removed) return Result.fail(CYCLE_NOT_FOUND);
    // Detach after the delete: if this half fails the issues point at a cycle
    // that's gone, which reads as no-cycle anyway — the reverse order would
    // orphan them from a cycle that still exists.
    await this.issues.clearCycleIds(tenantId, [cycleId]);

    return Result.ok();
  }
}

/**
 * Patch the team's cycle rhythm. Enabling seeds the current + 2 upcoming
 * cycles; disabling deletes the upcoming ones and drops their issues back to
 * no-cycle (history stays readable). Changing the length/cooldown/start-date of
 * an *automatic* team that stays enabled REBUILDS the whole cadence: every cycle
 * — the active one and closed history included — is wiped and regenerated from
 * the new anchor, renumbered from Cycle 1, and its issues fall back to no-cycle.
 * Switching between automatic and manual never deletes anything.
 */
@Injectable()
export class UpdateTeamCycleConfigUseCase
  implements
    IUsecaseExecute<
      { tenantId: string; teamId: string; dto: UpdateTeamCycleConfigDto },
      Result<TeamEntity>
    >
{
  constructor(
    @Inject(ITeamRepository) private readonly teams: ITeamRepository,
    @Inject(ICycleRepository) private readonly cycles: ICycleRepository,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    private readonly scheduler: CycleSchedulerService,
  ) {}

  async execute({
    tenantId,
    teamId,
    dto,
  }: {
    tenantId: string;
    teamId: string;
    dto: UpdateTeamCycleConfigDto;
  }): Promise<Result<TeamEntity>> {
    const team = await this.teams.findById(tenantId, teamId);
    if (!team) return Result.fail(TEAM_NOT_FOUND);

    const wasEnabled = team.cyclesEnabled;
    const wasAuto = !team.cyclesManual;
    const rhythmBefore = [
      team.cycleLengthWeeks,
      team.cycleCooldownWeeks,
      team.cycleStartDay,
      team.cycleStartDate ?? '',
    ].join();

    const set = team.setCycleConfig(dto);
    if (set.isFailure) return Result.fail(set.error as string);
    await this.teams.save(team);

    const today = todayISO();
    const rhythmChanged =
      [
        team.cycleLengthWeeks,
        team.cycleCooldownWeeks,
        team.cycleStartDay,
        team.cycleStartDate ?? '',
      ].join() !== rhythmBefore;

    // A rhythm change on a team that stays enabled AND automatic rebuilds the
    // whole cadence: wipe every cycle (frozen history included) and regenerate
    // from the new anchor below, renumbered from Cycle 1. The rhythm fields are
    // inert in manual mode, so requiring auto on *both* sides is what stops a
    // stale rhythm value riding along with the mode switch and destroying a
    // team's hand-planned cycles. Disabling is gentler — only the not-yet-started
    // cycles go, so past cycles stay readable. Either way the detached issues
    // fall back to no-cycle.
    const staysAuto = wasAuto && !team.cyclesManual;
    if (wasEnabled && team.cyclesEnabled && staysAuto && rhythmChanged) {
      const deleted = await this.cycles.deleteAllForTeam(tenantId, teamId);
      if (deleted.length) await this.issues.clearCycleIds(tenantId, deleted);
    } else if (wasEnabled && !team.cyclesEnabled) {
      const deleted = await this.cycles.deleteUpcoming(tenantId, teamId, today);
      if (deleted.length) await this.issues.clearCycleIds(tenantId, deleted);
    }

    if (team.cyclesEnabled) await this.scheduler.ensureCyclesCurrent(team, today);

    return Result.ok(team);
  }
}
