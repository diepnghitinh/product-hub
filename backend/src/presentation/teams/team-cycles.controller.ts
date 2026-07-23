import { BadRequestException, Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { EntityNotFoundException } from '@core/exceptions';
import { TEAM_NOT_FOUND } from '@application/teams/use-cases/team.use-cases';
import { TeamResponseDto } from '@application/teams/dtos/team.dtos';
import { TeamMapper } from '@application/teams/mappers/team.mapper';
import {
  GetCycleBurndownUseCase,
  GetTeamCyclesUseCase,
  UpdateTeamCycleConfigUseCase,
} from '@application/cycles/use-cases/cycle.use-cases';
import {
  CycleBurndownResponseDto,
  CycleResponseDto,
  UpdateTeamCycleConfigDto,
} from '@application/cycles/dtos/cycle.dtos';

/** Cycle endpoints under /teams — a cycle only exists as part of a team's rhythm. */
@ApiTags('Cycles')
@ApiBearerAuth('JWT-auth')
@Controller()
export class TeamCyclesController {
  constructor(
    private readonly getCycles: GetTeamCyclesUseCase,
    private readonly getBurndown: GetCycleBurndownUseCase,
    private readonly updateConfig: UpdateTeamCycleConfigUseCase,
  ) {}

  @Get(':teamId/cycles')
  @ApiOperation({
    summary: "List a team's cycles, newest-first (this read advances the lazy scheduler)",
  })
  async list(
    @AuthUser() auth: JwtPayload,
    @Param('teamId') teamId: string,
  ): Promise<CycleResponseDto[]> {
    const result = await this.getCycles.execute({ tenantId: auth.tenantId, teamId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return result.getValue();
  }

  @Get(':teamId/cycles/:cycleId/burndown')
  @ApiOperation({
    summary: "A cycle's burn-up series + breakdowns (reconstructed from issue timestamps)",
  })
  async burndown(
    @AuthUser() auth: JwtPayload,
    @Param('teamId') teamId: string,
    @Param('cycleId') cycleId: string,
  ): Promise<CycleBurndownResponseDto> {
    const result = await this.getBurndown.execute({ tenantId: auth.tenantId, teamId, cycleId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return result.getValue();
  }

  @Patch(':teamId/cycle-config')
  @Roles(Role.ADMIN, Role.PRODUCT)
  @ApiOperation({
    summary: "Patch a team's cycle rhythm (enable seeds cycles; disable deletes upcoming ones)",
  })
  async patchConfig(
    @AuthUser() auth: JwtPayload,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamCycleConfigDto,
  ): Promise<TeamResponseDto> {
    const result = await this.updateConfig.execute({ tenantId: auth.tenantId, teamId, dto });
    if (result.isFailure) {
      const msg = result.error as string;
      if (msg === TEAM_NOT_FOUND) throw new EntityNotFoundException(msg);
      throw new BadRequestException(msg);
    }
    return TeamMapper.toResponseDto(result.getValue());
  }
}
