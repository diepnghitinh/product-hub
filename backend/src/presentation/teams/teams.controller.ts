import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { EntityNotFoundException } from '@core/exceptions';
import {
  CreateTeamUseCase,
  GetTeamsUseCase,
  UpdateTeamStatusesUseCase,
  UpdateTeamLabelsUseCase,
  UpdateTeamCustomFieldsUseCase,
  UpdateTeamUseCase,
  SetTeamSharingUseCase,
  TEAM_DEFAULT_LOCKED,
  TEAM_NOT_FOUND,
} from '@application/teams/use-cases/team.use-cases';
import {
  CreateTeamDto,
  ShareTeamDto,
  TeamResponseDto,
  UpdateTeamDto,
  UpdateTeamLabelsDto,
  UpdateTeamCustomFieldsDto,
  UpdateTeamStatusesDto,
} from '@application/teams/dtos/team.dtos';
import { TeamMapper } from '@application/teams/mappers/team.mapper';

@ApiTags('Teams')
@ApiBearerAuth('JWT-auth')
@Controller()
export class TeamsController {
  constructor(
    private readonly getTeams: GetTeamsUseCase,
    private readonly createTeam: CreateTeamUseCase,
    private readonly updateTeam: UpdateTeamUseCase,
    private readonly updateStatuses: UpdateTeamStatusesUseCase,
    private readonly updateLabels: UpdateTeamLabelsUseCase,
    private readonly updateCustomFields: UpdateTeamCustomFieldsUseCase,
    private readonly setSharing: SetTeamSharingUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List teams (any authenticated user — drives the nav)' })
  async list(@AuthUser() auth: JwtPayload): Promise<TeamResponseDto[]> {
    const result = await this.getTeams.execute({ tenantId: auth.tenantId });
    return TeamMapper.toResponseDtoArray(result.getValue());
  }

  @Post()
  @Roles(Role.ADMIN, Role.PRODUCT)
  @ApiOperation({ summary: 'Add a team' })
  async create(
    @AuthUser() auth: JwtPayload,
    @Body() dto: CreateTeamDto,
  ): Promise<TeamResponseDto> {
    const result = await this.createTeam.execute({ tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    return TeamMapper.toResponseDto(result.getValue());
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.PRODUCT)
  @ApiOperation({ summary: 'Rename or archive a team (defaults cannot be archived)' })
  async update(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
  ): Promise<TeamResponseDto> {
    const result = await this.updateTeam.execute({ tenantId: auth.tenantId, id, dto });
    if (result.isFailure) {
      const msg = result.error as string;
      if (msg === TEAM_DEFAULT_LOCKED) throw new BadRequestException(msg);
      throw new EntityNotFoundException(msg);
    }
    return TeamMapper.toResponseDto(result.getValue());
  }

  @Put(':id/statuses')
  @Roles(Role.ADMIN, Role.PRODUCT)
  @ApiOperation({
    summary: "Replace a team's board columns (built-ins can be renamed/reordered, not removed)",
  })
  async setStatuses(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTeamStatusesDto,
  ): Promise<TeamResponseDto> {
    const result = await this.updateStatuses.execute({ tenantId: auth.tenantId, id, dto });
    if (result.isFailure) {
      const msg = result.error as string;
      if (msg === TEAM_NOT_FOUND) throw new EntityNotFoundException(msg);
      throw new BadRequestException(msg);
    }
    return TeamMapper.toResponseDto(result.getValue());
  }

  @Put(':id/labels')
  @Roles(Role.ADMIN, Role.PRODUCT)
  @ApiOperation({ summary: "Replace a team's item labels (shared by its tasks/bugs; may be empty)" })
  async setLabels(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTeamLabelsDto,
  ): Promise<TeamResponseDto> {
    const result = await this.updateLabels.execute({ tenantId: auth.tenantId, id, dto });
    if (result.isFailure) {
      const msg = result.error as string;
      if (msg === TEAM_NOT_FOUND) throw new EntityNotFoundException(msg);
      throw new BadRequestException(msg);
    }
    return TeamMapper.toResponseDto(result.getValue());
  }

  @Put(':id/custom-fields')
  @Roles(Role.ADMIN, Role.PRODUCT)
  @ApiOperation({ summary: "Replace a team's custom fields (shared by its tasks/bugs; may be empty)" })
  async setCustomFields(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTeamCustomFieldsDto,
  ): Promise<TeamResponseDto> {
    const result = await this.updateCustomFields.execute({ tenantId: auth.tenantId, id, dto });
    if (result.isFailure) {
      const msg = result.error as string;
      if (msg === TEAM_NOT_FOUND) throw new EntityNotFoundException(msg);
      throw new BadRequestException(msg);
    }
    return TeamMapper.toResponseDto(result.getValue());
  }

  @Post(':id/share')
  @Roles(Role.ADMIN, Role.PRODUCT)
  @ApiOperation({ summary: 'Toggle a team board public read-only link (admin/product)' })
  async share(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ShareTeamDto,
  ): Promise<TeamResponseDto> {
    const result = await this.setSharing.execute({
      tenantId: auth.tenantId,
      id,
      enabled: dto.enabled,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return TeamMapper.toResponseDto(result.getValue());
  }
}
