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
 * Patch the team's cycle rhythm. Enabling seeds the current + 2 upcoming
 * cycles; disabling deletes the upcoming ones and drops their issues back to
 * no-cycle (history stays). Changing the rhythm of an enabled team regenerates
 * the upcoming cycles on the new rhythm — the active cycle finishes as planned.
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

    // Turned off, or re-rhythmed while on: the not-yet-started cycles are stale.
    // Delete them and detach their issues; a rhythm change regenerates below.
    if (wasEnabled && (!team.cyclesEnabled || rhythmChanged)) {
      const deleted = await this.cycles.deleteUpcoming(tenantId, teamId, today);
      if (deleted.length) await this.issues.clearCycleIds(tenantId, deleted);
    }

    if (team.cyclesEnabled) await this.scheduler.ensureCyclesCurrent(team, today);

    return Result.ok(team);
  }
}
