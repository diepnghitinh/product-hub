import { Injectable } from '@nestjs/common';
import { Result } from '@shared/logic/result';
import { IUsecaseExecute } from '@core/interfaces';
import { GetTeamsUseCase } from '@application/teams/use-cases/team.use-cases';
import { GetTeamCyclesUseCase } from '@application/cycles/use-cases/cycle.use-cases';
import { CycleResponseDto } from '@application/cycles/dtos/cycle.dtos';
import { anyTeamChoices, didYouMean, resolveTeamAnyKind } from '../domain/mcp-resolve';
import { McpListCyclesDto } from '../dtos/mcp-analytics.dtos';
import { McpCycleSummaryDto } from '../dtos/mcp-analytics.response.dto';

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
