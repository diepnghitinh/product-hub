import { TeamEntity } from '@application/teams/domain/entities/team.entity';
import { TeamIssueType } from '@application/teams/domain/enums/team.enums';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import { CycleEntity } from '../domain/entities/cycle.entity';
import { CycleRollup, CycleStatus, CYCLE_FILTER_NO_MATCH } from '../domain/enums/cycle.enums';
import { ICycleRepository } from '../repositories/cycle.repository';
import { CycleSchedulerService } from './cycle-scheduler.service';

/** In-memory cycle store — the scheduler's generate/close loop needs real state. */
class FakeCycleRepo implements ICycleRepository {
  rows: CycleEntity[] = [];

  findByTeam = async (tenantId: string, teamId: string) =>
    this.rows
      .filter((c) => c.tenantId === tenantId && c.teamId === teamId)
      .sort((a, b) => a.number - b.number);

  findById = async (tenantId: string, id: string) =>
    this.rows.find((c) => c.tenantId === tenantId && c.id.toString() === id) ?? null;

  insert = async (cycle: CycleEntity) => {
    if (this.rows.some((c) => c.teamId === cycle.teamId && c.number === cycle.number)) return false;
    this.rows.push(cycle);
    return true;
  };

  closeCycle = async (tenantId: string, id: string, rollup: CycleRollup, at: Date) => {
    const cycle = await this.findById(tenantId, id);
    if (!cycle || cycle.isClosed) return false;
    cycle.close(rollup, at);
    return true;
  };

  deleteUpcoming = async (tenantId: string, teamId: string, today: string) => {
    const gone = this.rows.filter(
      (c) => c.tenantId === tenantId && c.teamId === teamId && c.startDate > today,
    );
    this.rows = this.rows.filter((c) => !gone.includes(c));
    return gone.map((c) => c.id.toString());
  };
}

const makeTeam = (over: Partial<Parameters<typeof TeamEntity.create>[0]> = {}) => {
  const result = TeamEntity.create({
    tenantId: 't1',
    key: 'engineering',
    name: 'Engineering',
    issueType: TeamIssueType.TASK,
    cyclesEnabled: true,
    cycleLengthWeeks: 2,
    cycleCooldownWeeks: 0,
    cycleStartDay: 1,
    cycleAutoRollover: true,
    ...over,
  });
  return result.getValue();
};

describe('CycleSchedulerService', () => {
  let cycles: FakeCycleRepo;
  let issues: jest.Mocked<
    Pick<IIssueRepository, 'cycleRollups' | 'moveUnfinishedIssues' | 'clearCycleIds'>
  >;
  let scheduler: CycleSchedulerService;

  // 2026-07-23 is a Thursday; the Monday before is 2026-07-20.
  const today = '2026-07-23';

  beforeEach(() => {
    cycles = new FakeCycleRepo();
    issues = {
      cycleRollups: jest.fn().mockResolvedValue({}),
      moveUnfinishedIssues: jest.fn().mockResolvedValue(0),
      clearCycleIds: jest.fn().mockResolvedValue(0),
    };
    scheduler = new CycleSchedulerService(cycles, issues as unknown as IIssueRepository);
  });

  it('does nothing for a team without cycles', async () => {
    const all = await scheduler.ensureCyclesCurrent(makeTeam({ cyclesEnabled: false }), today);
    expect(all).toHaveLength(0);
  });

  it('seeds the current cycle + 2 upcoming on first run, on the configured start day', async () => {
    const all = await scheduler.ensureCyclesCurrent(makeTeam(), today);

    expect(all.map((c) => c.number)).toEqual([1, 2, 3]);
    expect(all[0].startDate).toBe('2026-07-20'); // the Monday containing today
    expect(all[0].endDate).toBe('2026-08-02'); // 14 inclusive days
    expect(all[0].statusOn(today)).toBe(CycleStatus.ACTIVE);
    expect(all[1].startDate).toBe('2026-08-03'); // back-to-back, no cooldown
    expect(all[1].statusOn(today)).toBe(CycleStatus.UPCOMING);
    expect(all[2].statusOn(today)).toBe(CycleStatus.UPCOMING);
  });

  it('is idempotent — a second run changes nothing', async () => {
    await scheduler.ensureCyclesCurrent(makeTeam(), today);
    const again = await scheduler.ensureCyclesCurrent(makeTeam(), today);
    expect(again.map((c) => c.number)).toEqual([1, 2, 3]);
  });

  it('leaves a cooldown gap between cycles (and no active cycle inside it)', async () => {
    const team = makeTeam({ cycleCooldownWeeks: 1 });
    const all = await scheduler.ensureCyclesCurrent(team, today);

    // Cycle 1: Jul 20–Aug 2. Cooldown week. Cycle 2 starts Aug 10, not Aug 3.
    expect(all[1].startDate).toBe('2026-08-10');

    // A read during the cooldown finds no active cycle — and generation tops
    // upcoming back up to 2 rather than inventing a current one.
    const inCooldown = '2026-08-04';
    const later = await scheduler.ensureCyclesCurrent(team, inCooldown);
    expect(later.some((c) => c.statusOn(inCooldown) === CycleStatus.ACTIVE)).toBe(false);
    expect(later.filter((c) => c.statusOn(inCooldown) === CycleStatus.UPCOMING)).toHaveLength(2);
  });

  it('closes a past-due cycle: freezes stats from the pre-move rollup, then rolls unfinished forward', async () => {
    const team = makeTeam();
    const all = await scheduler.ensureCyclesCurrent(team, today);
    const first = all[0];
    issues.cycleRollups.mockResolvedValue({
      [first.id.toString()]: {
        scopeCount: 5,
        scopePoints: 13,
        completedCount: 3,
        completedPoints: 8,
        unfinishedIds: ['i-4', 'i-5'],
      },
    });

    // Read the day after cycle 1 ends.
    const dayAfter = '2026-08-03';
    const rolled = await scheduler.ensureCyclesCurrent(team, dayAfter);

    const closedFirst = rolled.find((c) => c.number === 1)!;
    expect(closedFirst.isClosed).toBe(true);
    expect(closedFirst.scopeCount).toBe(5);
    expect(closedFirst.completedPoints).toBe(8);
    // Who left is frozen with the stats (and agrees with them: 5 scope − 3 done).
    expect(closedFirst.unfinishedIds).toEqual(['i-4', 'i-5']);
    // Unfinished issues swept into the new current cycle (number 2).
    const current = rolled.find((c) => c.statusOn(dayAfter) === CycleStatus.ACTIVE)!;
    expect(current.number).toBe(2);
    expect(issues.moveUnfinishedIssues).toHaveBeenCalledWith(
      't1',
      [first.id.toString()],
      current.id.toString(),
      ['done'],
    );
    // And the rollup was taken before the move (freeze-then-sweep ordering).
    const rollupOrder = issues.cycleRollups.mock.invocationCallOrder[0];
    const moveOrder = issues.moveUnfinishedIssues.mock.invocationCallOrder[0];
    expect(rollupOrder).toBeLessThan(moveOrder);
  });

  it('rollover off: unfinished issues drop back to no-cycle', async () => {
    const team = makeTeam({ cycleAutoRollover: false });
    const all = await scheduler.ensureCyclesCurrent(team, today);
    await scheduler.ensureCyclesCurrent(team, '2026-08-03');
    expect(issues.moveUnfinishedIssues).toHaveBeenCalledWith(
      't1',
      [all[0].id.toString()],
      '',
      ['done'],
    );
  });

  it('freezes stats exactly once — a second boundary run does not rewrite history', async () => {
    const team = makeTeam();
    const seeded = await scheduler.ensureCyclesCurrent(team, today);
    issues.cycleRollups.mockResolvedValue({
      [seeded[0].id.toString()]: {
        scopeCount: 5,
        scopePoints: 13,
        completedCount: 3,
        completedPoints: 8,
        unfinishedIds: ['i-4', 'i-5'],
      },
    });
    await scheduler.ensureCyclesCurrent(team, '2026-08-03');

    // The world changed (issues rolled away) — a re-run must keep the frozen 5/13/3/8.
    issues.cycleRollups.mockResolvedValue({});
    const again = await scheduler.ensureCyclesCurrent(team, '2026-08-03');
    const first = again.find((c) => c.number === 1)!;
    expect(first.scopeCount).toBe(5);
    expect(first.completedPoints).toBe(8);
    expect(first.unfinishedIds).toEqual(['i-4', 'i-5']);
  });

  it('re-enabled after a long gap: jumps to the on-rhythm window instead of minting phantom cycles', async () => {
    const team = makeTeam();
    await scheduler.ensureCyclesCurrent(team, '2026-01-01');
    const before = await cycles.findByTeam('t1', team.id.toString());
    const lastNumber = before[before.length - 1].number;

    // Half a year of silence, then a read.
    const muchLater = '2026-07-23';
    const after = await scheduler.ensureCyclesCurrent(team, muchLater);

    // Numbers continue (no renumbering), but no cycle covers the dead gap …
    const fresh = after.filter((c) => c.number > lastNumber);
    expect(fresh[0].startDate).toBe('2026-07-20'); // the Monday containing "now"
    // … and we still end with one active + 2 upcoming.
    expect(after.filter((c) => c.statusOn(muchLater) === CycleStatus.UPCOMING)).toHaveLength(2);
    expect(after.filter((c) => c.statusOn(muchLater) === CycleStatus.ACTIVE)).toHaveLength(1);
  });

  it('a future start date opens cycle 1 on that date — nothing current until it arrives', async () => {
    const team = makeTeam({ cycleStartDate: '2026-08-10' }); // ~3 weeks out

    const all = await scheduler.ensureCyclesCurrent(team, today);
    // The loop begins in the future: two upcoming cycles, none active yet.
    expect(all.map((c) => c.number)).toEqual([1, 2]);
    expect(all[0].startDate).toBe('2026-08-10');
    expect(all.some((c) => c.statusOn(today) === CycleStatus.ACTIVE)).toBe(false);
    expect(all.filter((c) => c.statusOn(today) === CycleStatus.UPCOMING)).toHaveLength(2);

    // On the chosen date, cycle 1 is the active one.
    const started = await scheduler.ensureCyclesCurrent(team, '2026-08-10');
    const active = started.find((c) => c.statusOn('2026-08-10') === CycleStatus.ACTIVE);
    expect(active?.number).toBe(1);
  });

  it('a past start date aligns the loop to today without minting the skipped cycles', async () => {
    // 2026-01-05 is a Monday, exactly 28 weeks (14 two-week periods) before the
    // Monday containing today — so the cadence lands back on 2026-07-20.
    const team = makeTeam({ cycleStartDate: '2026-01-05' });

    const all = await scheduler.ensureCyclesCurrent(team, today);
    expect(all.map((c) => c.number)).toEqual([1, 2, 3]); // numbering still starts at 1
    expect(all[0].startDate).toBe('2026-07-20'); // in phase with Jan 5, around today
    expect(all[0].statusOn(today)).toBe(CycleStatus.ACTIVE);
  });

  it('uses bug done-keys for bug teams', async () => {
    const team = makeTeam({ issueType: TeamIssueType.BUG, key: 'qc', name: 'QC' });
    await scheduler.ensureCyclesCurrent(team, today);
    await scheduler.ensureCyclesCurrent(team, '2026-08-03');
    expect(issues.moveUnfinishedIssues).toHaveBeenCalledWith(
      't1',
      expect.any(Array),
      expect.any(String),
      ['resolved', 'closed'],
    );
  });

  describe('resolveCycleFilter', () => {
    it('resolves the sentinels against the live cycle set', async () => {
      const team = makeTeam();
      const all = await scheduler.ensureCyclesCurrent(team, today);

      expect(await scheduler.resolveCycleFilter(team, 'current', today)).toBe(all[0].id.toString());
      expect(await scheduler.resolveCycleFilter(team, 'upcoming', today)).toBe(all[1].id.toString());
      expect(await scheduler.resolveCycleFilter(team, 'none', today)).toBe('');
      expect(await scheduler.resolveCycleFilter(team, 'some-real-id', today)).toBe('some-real-id');
    });

    it('resolves current to a no-match id during cooldown', async () => {
      const team = makeTeam({ cycleCooldownWeeks: 1 });
      await scheduler.ensureCyclesCurrent(team, today);
      const inCooldown = '2026-08-04';
      expect(await scheduler.resolveCycleFilter(team, 'current', inCooldown)).toBe(
        CYCLE_FILTER_NO_MATCH,
      );
    });
  });
});
