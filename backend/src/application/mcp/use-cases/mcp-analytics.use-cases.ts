import { Injectable } from '@nestjs/common';
import { Result } from '@shared/logic/result';
import { IUsecaseExecute } from '@core/interfaces';
import { GetTeamsUseCase } from '@application/teams/use-cases/team.use-cases';
import {
  GetTeamCyclesUseCase,
  GetCycleBurndownUseCase,
} from '@application/cycles/use-cases/cycle.use-cases';
import { CycleResponseDto, CycleBurndownResponseDto } from '@application/cycles/dtos/cycle.dtos';
import { CycleStatus } from '@application/cycles/domain/enums/cycle.enums';
import { anyTeamChoices, didYouMean, resolveTeamAnyKind } from '../domain/mcp-resolve';
import {
  McpCycleBurndownDto,
  McpListCyclesDto,
  McpTeamVelocityDto,
} from '../dtos/mcp-analytics.dtos';
import { McpCycleSummaryDto, McpVelocityResponseDto } from '../dtos/mcp-analytics.response.dto';

import type { McpActor } from './mcp.use-cases';

// Dùng lại nguyên `McpActor` của `mcp.use-cases.ts` — analytics là file khác
// nhưng cùng một khái niệm "ai đang gọi". Re-export để tool và controller import
// từ một chỗ (`@application/mcp/use-cases`) bất kể use-case nằm file nào.
export type { McpActor };

/** Mặc định số sprint `list_cycles` trả về. */
const DEFAULT_CYCLE_LIMIT = 10;

/** `Result.fail` khi team tồn tại nhưng không chạy sprint. Tách khỏi "không tìm
 *  thấy team": danh sách rỗng đọc như "chưa có sprint nào", nghĩa khác hẳn. */
const cyclesOff = (name: string): string =>
  `Team "${name}" does not run sprints — enable cycles in Settings → Teams first.`;

/**
 * Sprint của một team: số hiệu, ngày, trạng thái, mục tiêu và rollup.
 *
 * Lưu ý: đây là *read có tác dụng phụ ghi*. `GetTeamCyclesUseCase` chạy lazy
 * scheduler (`ensureCyclesCurrent`), nên đọc danh sách có thể sinh cycle mới và
 * đóng băng thống kê của cycle vừa hết hạn. Vẫn đánh `readOnlyHint` ở tool: theo
 * góc nhìn người dùng không có gì trong sản phẩm đổi *do trợ lý* — mọi read chạm
 * cycle trong app đều làm đúng như vậy.
 */
@Injectable()
export class McpListCyclesUseCase
  implements
    IUsecaseExecute<{ actor: McpActor; dto: McpListCyclesDto }, Result<McpCycleSummaryDto[]>>
{
  constructor(
    private readonly getTeams: GetTeamsUseCase,
    private readonly getCycles: GetTeamCyclesUseCase,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpListCyclesDto;
  }): Promise<Result<McpCycleSummaryDto[]>> {
    const teams = (await this.getTeams.execute({ tenantId: actor.tenantId })).getValue();
    const team = resolveTeamAnyKind(teams, dto.team);
    if (!team) return Result.fail(didYouMean('team', dto.team, anyTeamChoices(teams)));
    if (!team.cyclesEnabled) return Result.fail(cyclesOff(team.name));

    const cycles = (
      await this.getCycles.execute({ tenantId: actor.tenantId, teamId: team.id.toString() })
    ).getValue();

    return Result.ok(cycles.slice(0, dto.limit ?? DEFAULT_CYCLE_LIMIT).map(toCycleSummary));
  }
}

/** `CycleResponseDto` → hình rút gọn cho trợ lý. `description: null` thành `''`
 *  để mọi trường đều là chuỗi — trợ lý không phải xử lý null. */
export function toCycleSummary(c: CycleResponseDto): McpCycleSummaryDto {
  return {
    id: c.id,
    number: c.number,
    name: c.name,
    startDate: c.startDate,
    endDate: c.endDate,
    status: c.status,
    goal: c.description ?? '',
    scopeCount: c.scopeCount,
    scopePoints: c.scopePoints,
    completedCount: c.completedCount,
    completedPoints: c.completedPoints,
  };
}

/**
 * Giải một tham chiếu sprint trên danh sách đã lấy về.
 *
 * Cố ý *không* dùng `CycleSchedulerService.resolveCycleFilter`: danh sách này đã
 * chạy qua lazy scheduler một lần rồi (`GetTeamCyclesUseCase` gọi
 * `ensureCyclesCurrent`), nên giải tại chỗ tránh được lượt quét thứ hai — và MCP
 * không phải phụ thuộc thêm vào scheduler.
 *
 * `last` là sentinel mới, không có trong bộ lọc của app: sprint đã đóng có
 * `endDate` lớn nhất. Chọn theo ngày chứ không theo số hiệu — team dùng cadence
 * thủ công có thể tạo Cycle 5 cho khung thời gian trước Cycle 4.
 */
export function resolveCycleRef(
  cycles: CycleResponseDto[],
  ref: string,
): CycleResponseDto | null {
  const wanted = ref?.trim().toLowerCase() ?? '';
  if (!wanted) return null;

  if (wanted === 'current' || wanted === 'active') {
    return cycles.find((c) => c.status === CycleStatus.ACTIVE) ?? null;
  }
  if (wanted === 'next' || wanted === 'upcoming') {
    return (
      cycles
        .filter((c) => c.status === CycleStatus.UPCOMING)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
    );
  }
  if (wanted === 'last' || wanted === 'previous') {
    return (
      cycles
        .filter((c) => c.status === CycleStatus.COMPLETED)
        .sort((a, b) => b.endDate.localeCompare(a.endDate))[0] ?? null
    );
  }

  return (
    cycles.find((c) => c.id === ref) ??
    cycles.find((c) => String(c.number) === wanted) ??
    cycles.find((c) => c.name.trim().toLowerCase() === wanted) ??
    null
  );
}

/** Gợi ý khi không giải được tham chiếu sprint — liệt kê cái gọi được. */
export function cycleChoices(cycles: CycleResponseDto[]): string[] {
  const named = cycles.slice(0, 8).map((c) => c.name || String(c.number));
  return ['current', 'next', 'last', ...named];
}

/** Riêng cho `current`/`next`/`last` không khớp: nói đúng *vì sao* rỗng. Trợ lý
 *  nhận "no sprint is running" sẽ báo lại người dùng đúng sự thật; nhận
 *  "not found" thì lại đi thử tên khác. */
const NO_MATCH: Record<string, string> = {
  current: 'No sprint is running right now — the team may be between cycles (cooldown).',
  active: 'No sprint is running right now — the team may be between cycles (cooldown).',
  next: 'No upcoming sprint is scheduled yet.',
  upcoming: 'No upcoming sprint is scheduled yet.',
  last: 'No sprint has been completed yet.',
  previous: 'No sprint has been completed yet.',
};

/**
 * Burn-up của một sprint: chuỗi theo ngày, cộng chia theo assignee/label/project.
 * Team resolve giống `McpListCyclesUseCase`; sprint resolve qua `resolveCycleRef`
 * trên danh sách vừa lấy — xem ghi chú ở đó về việc không dùng lại scheduler.
 */
@Injectable()
export class McpGetCycleBurndownUseCase
  implements
    IUsecaseExecute<
      { actor: McpActor; dto: McpCycleBurndownDto },
      Result<CycleBurndownResponseDto>
    >
{
  constructor(
    private readonly getTeams: GetTeamsUseCase,
    private readonly getCycles: GetTeamCyclesUseCase,
    private readonly getBurndown: GetCycleBurndownUseCase,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpCycleBurndownDto;
  }): Promise<Result<CycleBurndownResponseDto>> {
    const teams = (await this.getTeams.execute({ tenantId: actor.tenantId })).getValue();
    const team = resolveTeamAnyKind(teams, dto.team);
    if (!team) return Result.fail(didYouMean('team', dto.team, anyTeamChoices(teams)));
    if (!team.cyclesEnabled) return Result.fail(cyclesOff(team.name));

    const teamId = team.id.toString();
    const cycles = (
      await this.getCycles.execute({ tenantId: actor.tenantId, teamId })
    ).getValue();

    const cycle = resolveCycleRef(cycles, dto.cycle);
    if (!cycle) {
      const sentinel = NO_MATCH[dto.cycle?.trim().toLowerCase() ?? ''];
      return Result.fail(sentinel ?? didYouMean('sprint', dto.cycle, cycleChoices(cycles)));
    }

    return this.getBurndown.execute({ tenantId: actor.tenantId, teamId, cycleId: cycle.id });
  }
}

/** Số sprint đã đóng velocity nhìn lại khi không nói rõ. */
const DEFAULT_VELOCITY_CYCLES = 6;

/**
 * Velocity của một team qua các sprint đã đóng gần nhất: trung bình, min/max,
 * và đơn vị (points hay count) theo cách team thật sự đo — xem
 * `cycle-burndown.ts:218`.
 */
@Injectable()
export class McpGetTeamVelocityUseCase
  implements
    IUsecaseExecute<{ actor: McpActor; dto: McpTeamVelocityDto }, Result<McpVelocityResponseDto>>
{
  constructor(
    private readonly getTeams: GetTeamsUseCase,
    private readonly getCycles: GetTeamCyclesUseCase,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpTeamVelocityDto;
  }): Promise<Result<McpVelocityResponseDto>> {
    const teams = (await this.getTeams.execute({ tenantId: actor.tenantId })).getValue();
    const team = resolveTeamAnyKind(teams, dto.team);
    if (!team) return Result.fail(didYouMean('team', dto.team, anyTeamChoices(teams)));
    if (!team.cyclesEnabled) return Result.fail(cyclesOff(team.name));

    const all = (
      await this.getCycles.execute({ tenantId: actor.tenantId, teamId: team.id.toString() })
    ).getValue();

    // Chỉ sprint đã đóng: số của chúng đã đông cứng lúc close. Sprint đang chạy
    // có rollup tính sống, đưa vào trung bình sẽ kéo tụt vì chưa xong.
    const closed = all
      .filter((c) => c.status === CycleStatus.COMPLETED)
      .sort((a, b) => b.endDate.localeCompare(a.endDate))
      .slice(0, dto.cycles ?? DEFAULT_VELOCITY_CYCLES);

    if (!closed.length) {
      return Result.fail(
        `Team "${team.name}" has no completed sprint yet — velocity needs at least one finished cycle.`,
      );
    }

    // Đơn vị theo team, không mặc định là điểm: `cycle-burndown.ts:218` suy ra
    // đúng như vậy. Team không chấm điểm mà báo theo điểm thì ra 0 vĩnh viễn.
    const unit: 'points' | 'count' = closed.some((c) => c.scopePoints > 0) ? 'points' : 'count';
    const valueOf = (c: CycleResponseDto) =>
      unit === 'points' ? c.completedPoints : c.completedCount;

    const values = closed.map(valueOf);
    const average = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

    return Result.ok({
      teamName: team.name,
      unit,
      average,
      min: Math.min(...values),
      max: Math.max(...values),
      sprintsCounted: closed.length,
      // Chỉ có nghĩa khi đang báo theo điểm — mấy sprint này đóng góp 0 vào
      // trung bình dù thật ra có làm việc.
      unpointedSprints:
        unit === 'points'
          ? closed.filter((c) => c.scopePoints === 0).map((c) => c.number)
          : [],
      sprints: closed.map(toCycleSummary),
    });
  }
}
