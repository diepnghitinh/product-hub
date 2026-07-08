import {
  Body,
  Controller,
  Delete,
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
  CreateMilestoneUseCase,
  GetMilestonesUseCase,
  GetMilestoneUseCase,
  UpdateMilestoneUseCase,
  ReplaceObjectivesUseCase,
  DeleteMilestoneUseCase,
} from '@application/milestones/use-cases/milestone.use-cases';
import {
  CreateMilestoneDto,
  ReplaceObjectivesDto,
  UpdateMilestoneDto,
} from '@application/milestones/dtos/milestone.dtos';
import { MilestoneResponseDto } from '@application/milestones/dtos/milestone.response.dto';
import { MilestoneMapper } from '@application/milestones/mappers';

@ApiTags('Milestones')
@ApiBearerAuth('JWT-auth')
@Controller()
export class MilestonesController {
  constructor(
    private readonly createMilestone: CreateMilestoneUseCase,
    private readonly getMilestones: GetMilestonesUseCase,
    private readonly getMilestone: GetMilestoneUseCase,
    private readonly updateMilestone: UpdateMilestoneUseCase,
    private readonly replaceObjectives: ReplaceObjectivesUseCase,
    private readonly deleteMilestone: DeleteMilestoneUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List milestones (OKRs)' })
  async list(@AuthUser() auth: JwtPayload): Promise<MilestoneResponseDto[]> {
    const result = await this.getMilestones.execute({ tenantId: auth.tenantId });
    return MilestoneMapper.toResponseDtoArray(result.getValue());
  }

  @Post()
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Create a milestone' })
  async create(
    @AuthUser() auth: JwtPayload,
    @Body() dto: CreateMilestoneDto,
  ): Promise<MilestoneResponseDto> {
    const result = await this.createMilestone.execute({ tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return MilestoneMapper.toResponseDto(result.getValue());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a milestone' })
  async findOne(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<MilestoneResponseDto> {
    const result = await this.getMilestone.execute({ id, tenantId: auth.tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return MilestoneMapper.toResponseDto(result.getValue());
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Update milestone meta' })
  async update(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateMilestoneDto,
  ): Promise<MilestoneResponseDto> {
    const result = await this.updateMilestone.execute({ id, tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return MilestoneMapper.toResponseDto(result.getValue());
  }

  @Put(':id/objectives')
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Replace objectives + key results' })
  async putObjectives(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReplaceObjectivesDto,
  ): Promise<MilestoneResponseDto> {
    const result = await this.replaceObjectives.execute({ id, tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return MilestoneMapper.toResponseDto(result.getValue());
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a milestone (admin)' })
  async remove(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    const result = await this.deleteMilestone.execute({ id, tenantId: auth.tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return { ok: true };
  }
}
