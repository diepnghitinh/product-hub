import { Inject, Injectable } from '@nestjs/common';
import { TeamEntity } from '@application/teams/domain/entities/team.entity';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import { CycleEntity } from '../domain/entities/cycle.entity';
import {
  CYCLE_FILTER_CURRENT,
  CYCLE_FILTER_NONE,
  CYCLE_FILTER_NO_MATCH,
  CYCLE_FILTER_UPCOMING,
  CycleStatus,
  completedStatusKeysFor,
} from '../domain/enums/cycle.enums';
import { addDays, startDayOnOrBefore, todayISO } from '../domain/cycle-dates';
import { ICycleRepository } from '../repositories/cycle.repository';

/**
 * The "auto" in auto-sprints. There is no cron: every read that touches cycles
 * runs {@link ensureCyclesCurrent} first, so the first look after a boundary is
 * what advances the clock. It is idempotent and cheap when nothing is due (one
 * indexed find), and safe under concurrent runs — cycle generation is
 * deterministic behind a unique `(teamId, number)` index, and stat-freezing is
 * an atomic first-writer-wins claim. See features/cycles.md §7.1.
 */
@Injectable()
export class CycleSchedulerService {
  constructor(
    @Inject(ICycleRepository) private readonly cycles: ICycleRepository,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
  ) {}

  /**
   * Bring a team's cycles up to date: generate until an on-rhythm current cycle
   * and 2 upcoming ones exist, then process any past-due boundary — freeze its
   * stats and move unfinished issues to the next cycle (rollover on) or back to
   * no-cycle (off). No-op when the team doesn't use cycles.
   */
  async ensureCyclesCurrent(team: TeamEntity, today: string = todayISO()): Promise<CycleEntity[]> {
    if (!team.cyclesEnabled) {
      return this.cycles.findByTeam(team.tenantId, team.id.toString());
    }
    const tenantId = team.tenantId;
    const teamId = team.id.toString();

    let all = await this.cycles.findByTeam(tenantId, teamId);
    const generated = await this.generate(team, all, today);
    if (generated) all = await this.cycles.findByTeam(tenantId, teamId);

    const processed = await this.processDueBoundaries(team, all, today);
    if (processed) all = await this.cycles.findByTeam(tenantId, teamId);

    return all;
  }

  /** Create cycles until 2 upcoming exist (which implies a current one on the
   *  way there). Returns whether anything was inserted. */
  private async generate(team: TeamEntity, existing: CycleEntity[], today: string): Promise<boolean> {
    const lengthDays = team.cycleLengthWeeks * 7;
    const gapDays = 1 + team.cycleCooldownWeeks * 7;

    let last = existing.length ? existing[existing.length - 1] : undefined;
    let upcoming = existing.filter((c) => c.startDate > today).length;
    let inserted = false;

    while (upcoming < 2) {
      let start: string;
      if (!last) {
        // First cycle ever: start on the rhythm's day, containing today.
        start = startDayOnOrBefore(today, team.cycleStartDay);
      } else {
        start = addDays(last.endDate, gapDays);
        // Re-enabled after a long gap: chaining through the dead time would mint
        // phantom cycles nobody lived through. Jump straight to the on-rhythm
        // window around today (always after `last` — see the spec's date notes).
        if (addDays(start, lengthDays - 1) < today) {
          start = startDayOnOrBefore(today, team.cycleStartDay);
        }
      }

      const result = CycleEntity.create({
        tenantId: team.tenantId,
        teamId: team.id.toString(),
        number: (last?.number ?? 0) + 1,
        startDate: start,
        endDate: addDays(start, lengthDays - 1),
      });
      if (result.isFailure) throw new Error(result.error as string);
      const cycle = result.getValue();

      // A concurrent run may have taken this number; it computed the same cycle,
      // so losing the insert still means the cycle exists.
      const won = await this.cycles.insert(cycle);
      if (!won) return true;

      inserted = true;
      last = cycle;
      if (cycle.startDate > today) upcoming += 1;
    }
    return inserted;
  }

  /**
   * Close out cycles whose end has passed: freeze scope/completed *before* any
   * issue moves (that ordering is what makes history honest), then sweep every
   * unfinished issue still sitting in a completed cycle into the target — the
   * first not-yet-over cycle (rollover on) or no-cycle (off). The sweep spans
   * all completed cycles, so a missed run self-heals on the next read.
   */
  private async processDueBoundaries(
    team: TeamEntity,
    all: CycleEntity[],
    today: string,
  ): Promise<boolean> {
    const completedIds = all
      .filter((c) => c.statusOn(today) === CycleStatus.COMPLETED)
      .map((c) => c.id.toString());
    if (!completedIds.length) return false;

    const doneKeys = completedStatusKeysFor(team.issueType);
    const due = all.filter((c) => c.statusOn(today) === CycleStatus.COMPLETED && !c.isClosed);

    if (due.length) {
      const rollups = await this.issues.cycleRollups(
        team.tenantId,
        due.map((c) => c.id.toString()),
        doneKeys,
      );
      const now = new Date();
      for (const cycle of due) {
        const rollup = rollups[cycle.id.toString()] ?? {
          scopeCount: 0,
          scopePoints: 0,
          completedCount: 0,
          completedPoints: 0,
          unfinishedIds: [],
        };
        await this.cycles.closeCycle(team.tenantId, cycle.id.toString(), rollup, now);
      }
    }

    const target = team.cycleAutoRollover
      ? all.find((c) => c.statusOn(today) !== CycleStatus.COMPLETED)
      : undefined;
    const moved = await this.issues.moveUnfinishedIssues(
      team.tenantId,
      completedIds,
      target ? target.id.toString() : '',
      doneKeys,
    );
    return due.length > 0 || moved > 0;
  }

  /**
   * Resolve a `cycleId` list-filter value. The sentinels keep saved links
   * (`?cycle=current`) stable as cycles roll; during cooldown `current` resolves
   * to a no-match id so the board honestly reads empty. A real id (or unknown
   * value) passes through untouched.
   */
  async resolveCycleFilter(team: TeamEntity, value: string, today: string = todayISO()): Promise<string> {
    if (value === CYCLE_FILTER_NONE) return '';
    if (value !== CYCLE_FILTER_CURRENT && value !== CYCLE_FILTER_UPCOMING) return value;

    const all = await this.ensureCyclesCurrent(team, today);
    if (value === CYCLE_FILTER_CURRENT) {
      const active = all.find((c) => c.statusOn(today) === CycleStatus.ACTIVE);
      return active ? active.id.toString() : CYCLE_FILTER_NO_MATCH;
    }
    const next = all.find((c) => c.statusOn(today) === CycleStatus.UPCOMING);
    return next ? next.id.toString() : CYCLE_FILTER_NO_MATCH;
  }
}
