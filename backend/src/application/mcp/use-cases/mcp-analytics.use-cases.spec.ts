import { Result } from '@shared/logic/result';
import { ApiKeyScope } from '@application/api-keys/domain/api-key.enums';
import { CycleStatus } from '@application/cycles/domain/enums/cycle.enums';
import { TeamIssueType } from '@application/teams/domain/enums/team.enums';
import { McpListCyclesUseCase, type McpActor } from './mcp-analytics.use-cases';

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
