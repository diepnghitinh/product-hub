import { Result } from '@shared/logic/result';
import { ApiKeyScope } from '@application/api-keys/domain/api-key.enums';
import { CycleStatus } from '@application/cycles/domain/enums/cycle.enums';
import { TeamIssueType } from '@application/teams/domain/enums/team.enums';
import {
  McpGetCycleBurndownUseCase,
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
