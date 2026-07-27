import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ITeamRepository } from '@application/teams/repositories/team.repository';
import { TeamEntity } from '@application/teams/domain/entities/team.entity';
import { TEAM_NOT_FOUND } from '@application/teams/use-cases/team.use-cases';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import {
  CycleBurndownResponseDto,
  CycleResponseDto,
  UpdateCycleDto,
  UpdateTeamCycleConfigDto,
} from '../dtos/cycle.dtos';
import { CycleMapper } from '../mappers/cycle.mapper';
import { completedStatusKeysFor } from '../domain/enums/cycle.enums';
import { buildBurndown } from '../domain/cycle-burndown';
import { todayISO } from '../domain/cycle-dates';
import { ICycleRepository } from '../repositories/cycle.repository';
import { CycleSchedulerService } from '../services/cycle-scheduler.service';

/** A cycle id that doesn't exist (or belongs to another team). */
export const CYCLE_NOT_FOUND = 'Cycle not found';

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

    const dtos = cycles
      .slice()
      .sort((a, b) => b.number - a.number)
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
 * Set (or clear) a single cycle's goal/notes — the Scrum "sprint goal". Any
 * cycle can be annotated (upcoming, active, or closed history alike); it's a
 * note, not a stat, so closed cycles aren't frozen against it. The reply carries
 * live rollups for a still-open cycle, exactly like the list read, so the client
 * can drop the fresh DTO straight into its cache.
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

    cycle.setDescription(dto.description);
    await this.cycles.setDescription(tenantId, cycleId, cycle.description);

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
 * Patch the team's cycle rhythm. Enabling seeds the current + 2 upcoming
 * cycles; disabling deletes the upcoming ones and drops their issues back to
 * no-cycle (history stays readable). Changing the length/cooldown/start-date of
 * a team that stays enabled REBUILDS the whole cadence: every cycle — the active
 * one and closed history included — is wiped and regenerated from the new anchor,
 * renumbered from Cycle 1, and its issues fall back to no-cycle.
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

    // A rhythm change on a team that stays enabled rebuilds the whole cadence:
    // wipe every cycle (frozen history included) and regenerate from the new
    // anchor below, renumbered from Cycle 1. Disabling is gentler — only the
    // not-yet-started cycles go, so past cycles stay readable. Either way the
    // detached issues fall back to no-cycle.
    if (wasEnabled && team.cyclesEnabled && rhythmChanged) {
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
