import { Result } from '@shared/logic/result';
import { ApiKeyScope } from '@application/api-keys/domain/api-key.enums';
import { CycleStatus } from '@application/cycles/domain/enums/cycle.enums';
import { TeamIssueType } from '@application/teams/domain/enums/team.enums';
import {
  McpGetBugStatsUseCase,
  McpGetCycleBurndownUseCase,
  McpGetTeamVelocityUseCase,
  McpListCyclesUseCase,
  resolveCycleRef,
  type McpActor,
} from './mcp-analytics.use-cases';

const actor: McpActor = {
  tenantId: 't1',
  keyId: 'k1',
  keyName: 'CI',
  userId: 'u1',
  scope: ApiKeyScope.READ_ONLY,
  clientName: 'claude-code/1.0',
};

const team = (id: string, name: string, cyclesEnabled = true) =>
  ({
    id: { toString: () => id },
    name,
    key: name.toLowerCase(),
    issueType: TeamIssueType.TASK,
    archived: false,
    cyclesEnabled,
  }) as never;

const teamBug = (id: string, name: string) =>
  ({
    id: { toString: () => id },
    name,
    key: name.toLowerCase(),
    issueType: TeamIssueType.BUG,
    archived: false,
    cyclesEnabled: true,
  }) as never;

const cycle = (n: number, status: CycleStatus, endDate: string) => ({
  id: `c${n}`,
  number: n,
  name: '',
  startDate: '2026-01-01',
  endDate,
  status,
  description: null,
  scopeCount: 10,
  scopePoints: 30,
  completedCount: 8,
  completedPoints: 24,
});

describe('McpListCyclesUseCase', () => {
  const build = (teams: unknown[], cycles: unknown[]) => {
    const getTeams = { execute: jest.fn().mockResolvedValue(Result.ok(teams)) };
    const getCycles = { execute: jest.fn().mockResolvedValue(Result.ok(cycles)) };
    return {
      useCase: new McpListCyclesUseCase(getTeams as never, getCycles as never),
      getTeams,
      getCycles,
    };
  };

  it('trả về sprint của team, mục tiêu rỗng khi description null', async () => {
    const { useCase } = build(
      [team('t1', 'Engineering')],
      [cycle(2, CycleStatus.ACTIVE, '2026-02-01')],
    );
    const res = await useCase.execute({ actor, dto: { team: 'Engineering' } });
    expect(res.isSuccess).toBe(true);
    const [first] = res.getValue();
    expect(first.number).toBe(2);
    expect(first.goal).toBe('');
    expect(first.completedPoints).toBe(24);
  });

  it('tên team sai → lỗi kèm danh sách hợp lệ', async () => {
    const { useCase, getCycles } = build([team('t1', 'Engineering')], []);
    const res = await useCase.execute({ actor, dto: { team: 'Marketing' } });
    expect(res.isFailure).toBe(true);
    expect(res.error).toContain('Engineering');
    expect(getCycles.execute).not.toHaveBeenCalled();
  });

  it('team đã tắt cycle → thông báo riêng, không phải danh sách rỗng', async () => {
    const { useCase, getCycles } = build([team('t1', 'Engineering', false)], []);
    const res = await useCase.execute({ actor, dto: { team: 'Engineering' } });
    expect(res.isFailure).toBe(true);
    expect(res.error).toMatch(/does not run sprints/i);
    expect(getCycles.execute).not.toHaveBeenCalled();
  });

  it('cắt theo limit', async () => {
    const many = [1, 2, 3, 4].map((n) => cycle(n, CycleStatus.COMPLETED, `2026-0${n}-01`));
    const { useCase } = build([team('t1', 'Engineering')], many);
    const res = await useCase.execute({ actor, dto: { team: 'Engineering', limit: 2 } });
    expect(res.getValue()).toHaveLength(2);
  });
});

describe('resolveCycleRef', () => {
  const cycles = [
    { ...cycle(3, CycleStatus.UPCOMING, '2026-04-01'), id: 'c3', startDate: '2026-03-15' },
    { ...cycle(2, CycleStatus.ACTIVE, '2026-03-01'), id: 'c2' },
    { ...cycle(1, CycleStatus.COMPLETED, '2026-02-01'), id: 'c1' },
    { ...cycle(0, CycleStatus.COMPLETED, '2026-01-15'), id: 'c0' },
  ] as never[];

  it('"current" chọn sprint đang chạy', () => {
    expect(resolveCycleRef(cycles, 'current')?.id).toBe('c2');
  });

  it('"next" chọn sprint sắp tới sớm nhất theo ngày bắt đầu', () => {
    expect(resolveCycleRef(cycles, 'next')?.id).toBe('c3');
  });

  it('"last" chọn sprint đã đóng gần nhất theo endDate, không phải số lớn nhất', () => {
    expect(resolveCycleRef(cycles, 'last')?.id).toBe('c1');
  });

  it('nhận số hiệu sprint', () => {
    expect(resolveCycleRef(cycles, '3')?.id).toBe('c3');
  });

  it('nhận id thẳng', () => {
    expect(resolveCycleRef(cycles, 'c0')?.id).toBe('c0');
  });

  it('"current" khi không có sprint chạy → null', () => {
    const noneActive = cycles.filter((c) => (c as { status: string }).status !== CycleStatus.ACTIVE);
    expect(resolveCycleRef(noneActive, 'current')).toBeNull();
  });
});

describe('McpGetCycleBurndownUseCase', () => {
  const burndown = { cycleId: 'c2', number: 2, unit: 'points', series: [], assignees: [], labels: [], projects: [] };

  const build = (cycles: unknown[]) => {
    const getTeams = { execute: jest.fn().mockResolvedValue(Result.ok([team('t1', 'Engineering')])) };
    const getCycles = { execute: jest.fn().mockResolvedValue(Result.ok(cycles)) };
    const getBurndown = { execute: jest.fn().mockResolvedValue(Result.ok(burndown)) };
    return {
      useCase: new McpGetCycleBurndownUseCase(getTeams as never, getCycles as never, getBurndown as never),
      getBurndown,
    };
  };

  it('giải "current" rồi chuyển đúng cycleId xuống use-case burndown', async () => {
    const { useCase, getBurndown } = build([cycle(2, CycleStatus.ACTIVE, '2026-03-01')]);
    const res = await useCase.execute({ actor, dto: { team: 'Engineering', cycle: 'current' } });
    expect(res.isSuccess).toBe(true);
    expect(getBurndown.execute).toHaveBeenCalledWith({
      tenantId: 't1',
      teamId: 't1',
      cycleId: 'c2',
    });
  });

  it('"current" khi không có sprint chạy → nói rõ, không phải "not found"', async () => {
    const { useCase, getBurndown } = build([cycle(1, CycleStatus.COMPLETED, '2026-02-01')]);
    const res = await useCase.execute({ actor, dto: { team: 'Engineering', cycle: 'current' } });
    expect(res.isFailure).toBe(true);
    expect(res.error).toMatch(/no sprint is running/i);
    expect(getBurndown.execute).not.toHaveBeenCalled();
  });

  it('tham chiếu sprint lạ → lỗi kèm lựa chọn', async () => {
    const { useCase } = build([cycle(1, CycleStatus.COMPLETED, '2026-02-01')]);
    const res = await useCase.execute({ actor, dto: { team: 'Engineering', cycle: 'Sprint 99' } });
    expect(res.isFailure).toBe(true);
    expect(res.error).toContain('current');
  });
});

describe('McpGetTeamVelocityUseCase', () => {
  const build = (cycles: unknown[]) => {
    const getTeams = { execute: jest.fn().mockResolvedValue(Result.ok([team('t1', 'Engineering')])) };
    const getCycles = { execute: jest.fn().mockResolvedValue(Result.ok(cycles)) };
    return { useCase: new McpGetTeamVelocityUseCase(getTeams as never, getCycles as never) };
  };

  const done = (n: number, scopePoints: number, completedPoints: number, completedCount = 5) => ({
    ...cycle(n, CycleStatus.COMPLETED, `2026-0${n}-01`),
    id: `c${n}`,
    scopePoints,
    completedPoints,
    completedCount,
    scopeCount: 8,
  });

  it('tính trung bình và dải theo điểm khi team có chấm điểm', async () => {
    const { useCase } = build([done(1, 30, 20), done(2, 30, 30), done(3, 30, 25)]);
    const res = await useCase.execute({ actor, dto: { team: 'Engineering' } });
    const v = res.getValue();
    expect(v.unit).toBe('points');
    expect(v.average).toBe(25);
    expect(v.min).toBe(20);
    expect(v.max).toBe(30);
    expect(v.sprintsCounted).toBe(3);
  });

  it('team không chấm điểm → đo bằng số việc, không phải 0 điểm', async () => {
    const { useCase } = build([done(1, 0, 0, 6), done(2, 0, 0, 4)]);
    const v = (await useCase.execute({ actor, dto: { team: 'Engineering' } })).getValue();
    expect(v.unit).toBe('count');
    expect(v.average).toBe(5);
  });

  it('sprint lẫn lộn → báo theo điểm và chỉ ra sprint thiếu điểm', async () => {
    const { useCase } = build([done(1, 30, 30), done(2, 0, 0, 4)]);
    const v = (await useCase.execute({ actor, dto: { team: 'Engineering' } })).getValue();
    expect(v.unit).toBe('points');
    expect(v.unpointedSprints).toEqual([2]);
  });

  it('bỏ qua sprint chưa đóng', async () => {
    const { useCase } = build([
      { ...cycle(9, CycleStatus.ACTIVE, '2026-09-01'), id: 'c9', scopePoints: 30, completedPoints: 99 },
      done(1, 30, 20),
    ]);
    const v = (await useCase.execute({ actor, dto: { team: 'Engineering' } })).getValue();
    expect(v.sprintsCounted).toBe(1);
    expect(v.average).toBe(20);
  });

  it('chưa có sprint nào đóng → lỗi rõ nghĩa, không chia cho 0', async () => {
    const { useCase } = build([{ ...cycle(1, CycleStatus.ACTIVE, '2026-01-01'), id: 'c1' }]);
    const res = await useCase.execute({ actor, dto: { team: 'Engineering' } });
    expect(res.isFailure).toBe(true);
    expect(res.error).toMatch(/no completed sprint/i);
  });

  it('chỉ lấy N sprint đóng gần nhất', async () => {
    const { useCase } = build([done(3, 30, 30), done(2, 30, 20), done(1, 30, 10)]);
    const v = (await useCase.execute({ actor, dto: { team: 'Engineering', cycles: 2 } })).getValue();
    expect(v.sprintsCounted).toBe(2);
    expect(v.average).toBe(25);
  });
});

describe('McpGetBugStatsUseCase', () => {
  const rawOf = (over: object = {}) => ({
    total: 10,
    dimensions: { status: [{ key: 'open', name: '', count: 10 }] },
    opened: [],
    closed: [],
    ...over,
  });

  const build = (raw: object = rawOf()) => {
    const getTeams = { execute: jest.fn().mockResolvedValue(Result.ok([teamBug('t9', 'QC')])) };
    const issues = { bugStats: jest.fn().mockResolvedValue(raw) };
    // `title`, không phải `name` — ProjectEntity không có getter `name`. Mock sai
    // trường sẽ cho test xanh trong khi code thật rơi về id trần.
    const projects = { findById: jest.fn().mockResolvedValue({ title: 'Ads Connect' }) };
    return {
      useCase: new McpGetBugStatsUseCase(getTeams as never, issues as never, projects as never),
      issues,
      projects,
    };
  };

  it('mặc định gom theo status và severity', async () => {
    const { useCase, issues } = build();
    await useCase.execute({ actor, dto: {} });
    expect(issues.bugStats).toHaveBeenCalledWith('t1', {}, ['status', 'severity'], undefined);
  });

  it('giải tên team bug và chuyển teamId xuống repo', async () => {
    const { useCase, issues } = build();
    await useCase.execute({ actor, dto: { team: 'QC' } });
    expect(issues.bugStats).toHaveBeenCalledWith('t1', { teamId: 't9' }, expect.anything(), undefined);
  });

  it('tên team sai → lỗi kèm danh sách team bug', async () => {
    const { useCase, issues } = build();
    const res = await useCase.execute({ actor, dto: { team: 'Engineering' } });
    expect(res.isFailure).toBe(true);
    expect(res.error).toContain('QC');
    expect(issues.bugStats).not.toHaveBeenCalled();
  });

  it('chiều gom lạ → lỗi kèm 6 chiều hợp lệ', async () => {
    const { useCase } = build();
    const res = await useCase.execute({ actor, dto: { groupBy: ['owner'] as never } });
    expect(res.isFailure).toBe(true);
    expect(res.error).toContain('severity');
  });

  it('until nhỏ hơn since → lỗi chỉ rõ trường', async () => {
    const { useCase } = build();
    const res = await useCase.execute({ actor, dto: { since: '2026-05-01', until: '2026-04-01' } });
    expect(res.isFailure).toBe(true);
    expect(res.error).toMatch(/until/i);
  });

  it('ngày sai định dạng → lỗi', async () => {
    const { useCase } = build();
    const res = await useCase.execute({ actor, dto: { since: '01/05/2026' } });
    expect(res.isFailure).toBe(true);
    expect(res.error).toMatch(/YYYY-MM-DD/);
  });

  it('trend không có khoảng → dùng 12 mốc gần nhất, không báo lỗi trần', async () => {
    const { useCase } = build(rawOf({ opened: [], closed: [] }));
    const res = await useCase.execute({ actor, dto: { trend: 'week' } });
    expect(res.isSuccess).toBe(true);
    expect(res.getValue().trend).toHaveLength(12);
  });

  it('trend vượt 26 mốc → báo lỗi yêu cầu thu hẹp, không cắt lặng', async () => {
    const { useCase } = build();
    const res = await useCase.execute({
      actor,
      dto: { trend: 'week', since: '2024-01-01', until: '2026-01-01' },
    });
    expect(res.isFailure).toBe(true);
    expect(res.error).toMatch(/narrow/i);
  });

  it('tra tên project cho ô đã cắt trần', async () => {
    const { useCase, projects } = build(
      rawOf({ dimensions: { project: [{ key: 'p1', name: '', count: 3 }] } }),
    );
    const v = (await useCase.execute({ actor, dto: { groupBy: ['project'] } })).getValue();
    expect(projects.findById).toHaveBeenCalledWith('p1');
    expect(v.dimensions[0].buckets[0].label).toBe('Ads Connect');
  });
});
