import { Inject, Injectable } from '@nestjs/common';
import { Result } from '@shared/logic/result';
import { IUsecaseExecute } from '@core/interfaces';
import { GetTeamsUseCase } from '@application/teams/use-cases/team.use-cases';
import {
  GetTeamCyclesUseCase,
  GetCycleBurndownUseCase,
} from '@application/cycles/use-cases/cycle.use-cases';
import { CycleResponseDto, CycleBurndownResponseDto } from '@application/cycles/dtos/cycle.dtos';
import { CycleStatus } from '@application/cycles/domain/enums/cycle.enums';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import { IProjectRepository } from '@application/projects/repositories/project.repository';
import { IssueKind } from '@application/issues/domain/enums/issue.enums';
import {
  anyTeamChoices,
  didYouMean,
  resolveTeam,
  resolveTeamAnyKind,
  teamChoices,
} from '../domain/mcp-resolve';
import {
  BUG_STAT_DIMENSIONS,
  BugStatDimension,
  DEFAULT_DIMENSIONS,
  DEFAULT_TREND_BUCKETS,
  DIMENSION_CAP,
  RawBugStats,
  TREND_CAP,
  foldDimension,
  mergeTrend,
  trendRange,
} from '../domain/mcp-bug-stats';
import {
  McpBugStatsDto,
  McpCycleBurndownDto,
  McpListCyclesDto,
  McpTeamVelocityDto,
} from '../dtos/mcp-analytics.dtos';
import {
  McpBugStatsResponseDto,
  McpCycleSummaryDto,
  McpVelocityResponseDto,
} from '../dtos/mcp-analytics.response.dto';

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

/** Ngày phải là YYYY-MM-DD — chuỗi khác dễ bị Date() nuốt thành ngày sai. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Phân bố bug: ảnh chụp theo chiều (status/severity/assignee/team/label/project)
 * cộng dòng chảy mở/đóng theo tuần/tháng. Mọi trần và ghép dòng chảy là logic
 * thuần ở `../domain/mcp-bug-stats` — use-case này chỉ giải tham chiếu, kiểm
 * tham số và gọi repository.
 */
@Injectable()
export class McpGetBugStatsUseCase
  implements
    IUsecaseExecute<{ actor: McpActor; dto: McpBugStatsDto }, Result<McpBugStatsResponseDto>>
{
  constructor(
    private readonly getTeams: GetTeamsUseCase,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(IProjectRepository) private readonly projects: IProjectRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpBugStatsDto;
  }): Promise<Result<McpBugStatsResponseDto>> {
    const dimensions = dto.groupBy?.length ? dto.groupBy : DEFAULT_DIMENSIONS;
    const bad = dimensions.find((d) => !BUG_STAT_DIMENSIONS.includes(d));
    if (bad) return Result.fail(didYouMean('groupBy dimension', bad, BUG_STAT_DIMENSIONS));

    for (const [field, value] of [
      ['since', dto.since],
      ['until', dto.until],
    ] as const) {
      if (value && !ISO_DATE.test(value)) {
        return Result.fail(`"${field}" must be a date in YYYY-MM-DD format, got "${value}".`);
      }
    }
    if (dto.since && dto.until && dto.until < dto.since) {
      return Result.fail(`"until" (${dto.until}) is before "since" (${dto.since}).`);
    }

    // Team bug — resolveTeam lọc theo loại, nên gõ tên team task vào đây sẽ báo
    // "không có team bug tên đó" thay vì một lỗi khó hiểu ở tầng dưới.
    const teams = (await this.getTeams.execute({ tenantId: actor.tenantId })).getValue();
    let teamId: string | undefined;
    let teamName = '';
    if (dto.team) {
      const team = resolveTeam(teams, dto.team, IssueKind.BUG);
      if (!team) {
        return Result.fail(didYouMean('bug team', dto.team, teamChoices(teams, IssueKind.BUG)));
      }
      teamId = team.id.toString();
      teamName = team.name;
    }

    // Cửa sổ trend: không cho khoảng thì lấy DEFAULT_TREND_BUCKETS mốc gần nhất.
    // Bỏ mặc định thì dải là toàn bộ lịch sử → chắc chắn vượt TREND_CAP và tool
    // hỏng ngay lần gọi đầu.
    let range: string[] = [];
    let since = dto.since ?? '';
    let until = dto.until ?? '';
    if (dto.trend) {
      if (!since || !until) {
        const end = until ? new Date(`${until}T00:00:00Z`) : new Date();
        const start = new Date(end);
        if (dto.trend === 'week') start.setUTCDate(start.getUTCDate() - 7 * (DEFAULT_TREND_BUCKETS - 1));
        else start.setUTCMonth(start.getUTCMonth() - (DEFAULT_TREND_BUCKETS - 1));
        since = since || start.toISOString().slice(0, 10);
        until = until || end.toISOString().slice(0, 10);
      }
      range = trendRange(since, until, dto.trend);
      if (range.length > TREND_CAP) {
        return Result.fail(
          `That range covers ${range.length} ${dto.trend}s — narrow it to ${TREND_CAP} or fewer ` +
            `(use "month" instead of "week", or a shorter since/until).`,
        );
      }
    }

    const raw = await this.issues.bugStats(
      actor.tenantId,
      {
        ...(teamId ? { teamId } : {}),
        ...(dto.since ? { since: new Date(`${dto.since}T00:00:00.000Z`) } : {}),
        ...(dto.until ? { until: new Date(`${dto.until}T23:59:59.999Z`) } : {}),
      },
      dimensions,
      dto.trend ? { unit: dto.trend, timezone: 'UTC' } : undefined,
    );

    // Chỉ project cần tra tên ngoài — assignee đã có name denormalized, label
    // lấy từ team, còn status/severity/team là chính giá trị đó.
    const projectNames = await this.projectNames(raw, dimensions);
    const teamNames = Object.fromEntries(teams.map((t) => [t.id.toString(), t.name]));
    // Ép kiểu tuple: flatMap suy ra string[][] chứ không phải [string, string][],
    // và Object.fromEntries đòi cái sau. `t.labels ?? []` vì không phải mọi team
    // mock/entity đều đảm bảo có mảng này.
    const labelNames = Object.fromEntries(
      teams.flatMap((t) => (t.labels ?? []).map((l) => [l.key, l.name] as [string, string])),
    );

    const namesFor = (d: BugStatDimension): Record<string, string> =>
      d === 'project' ? projectNames : d === 'team' ? teamNames : d === 'label' ? labelNames : {};

    return Result.ok({
      total: raw.total,
      teamName,
      since,
      until,
      dimensions: dimensions.map((d) => foldDimension(d, raw.dimensions[d] ?? [], namesFor(d))),
      trend: dto.trend ? mergeTrend(range, raw.opened, raw.closed) : [],
      trendUnit: dto.trend ?? '',
    });
  }

  /** Tên project cho tối đa DIMENSION_CAP id — tra sau khi đã cắt trần, nên
   *  nhiều nhất 10 lượt đọc, chạy song song. */
  private async projectNames(
    raw: RawBugStats,
    dimensions: BugStatDimension[],
  ): Promise<Record<string, string>> {
    if (!dimensions.includes('project')) return {};
    const ids = (raw.dimensions.project ?? [])
      .filter((r) => r.key)
      .sort((a, b) => b.count - a.count)
      .slice(0, DIMENSION_CAP)
      .map((r) => r.key);
    const found = await Promise.all(ids.map((id) => this.projects.findById(id)));
    // `ProjectEntity` gọi tên hiển thị là `title`, KHÔNG phải `name` — nó không
    // có getter `name`. Dùng nhầm sẽ ra undefined rồi âm thầm rơi về id trần.
    return Object.fromEntries(ids.map((id, i) => [id, found[i]?.title || id]));
  }
}
