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
  CreateRoadmapUseCase,
  GetRoadmapsUseCase,
  GetRoadmapUseCase,
  UpdateRoadmapUseCase,
  ReplaceRoadmapItemsUseCase,
  ReplaceRoadmapColumnsUseCase,
  ReplaceRoadmapEpicsUseCase,
  DeleteRoadmapUseCase,
  SetRoadmapSharingUseCase,
} from '@application/roadmaps/use-cases/roadmap.use-cases';
import {
  CreateRoadmapDto,
  ReplaceRoadmapColumnsDto,
  ReplaceRoadmapEpicsDto,
  ReplaceRoadmapItemsDto,
  ShareRoadmapDto,
  UpdateRoadmapDto,
} from '@application/roadmaps/dtos/roadmap.dtos';
import { RoadmapResponseDto } from '@application/roadmaps/dtos/roadmap.response.dto';
import { RoadmapMapper } from '@application/roadmaps/mappers';

@ApiTags('Roadmaps')
@ApiBearerAuth('JWT-auth')
@Controller()
export class RoadmapsController {
  constructor(
    private readonly createRoadmap: CreateRoadmapUseCase,
    private readonly getRoadmaps: GetRoadmapsUseCase,
    private readonly getRoadmap: GetRoadmapUseCase,
    private readonly updateRoadmap: UpdateRoadmapUseCase,
    private readonly replaceItems: ReplaceRoadmapItemsUseCase,
    private readonly replaceColumns: ReplaceRoadmapColumnsUseCase,
    private readonly replaceEpics: ReplaceRoadmapEpicsUseCase,
    private readonly deleteRoadmap: DeleteRoadmapUseCase,
    private readonly setSharing: SetRoadmapSharingUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List roadmaps' })
  async list(@AuthUser() auth: JwtPayload): Promise<RoadmapResponseDto[]> {
    const result = await this.getRoadmaps.execute({ tenantId: auth.tenantId });
    return RoadmapMapper.toResponseDtoArray(result.getValue());
  }

  @Post()
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT)
  @ApiOperation({ summary: 'Create a roadmap' })
  async create(
    @AuthUser() auth: JwtPayload,
    @Body() dto: CreateRoadmapDto,
  ): Promise<RoadmapResponseDto> {
    const result = await this.createRoadmap.execute({ tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return RoadmapMapper.toResponseDto(result.getValue());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a roadmap' })
  async findOne(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<RoadmapResponseDto> {
    const result = await this.getRoadmap.execute({ id, tenantId: auth.tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return RoadmapMapper.toResponseDto(result.getValue());
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT)
  @ApiOperation({ summary: 'Update roadmap meta' })
  async update(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRoadmapDto,
  ): Promise<RoadmapResponseDto> {
    const result = await this.updateRoadmap.execute({ id, tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return RoadmapMapper.toResponseDto(result.getValue());
  }

  @Put(':id/items')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT)
  @ApiOperation({ summary: 'Replace roadmap items' })
  async putItems(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReplaceRoadmapItemsDto,
  ): Promise<RoadmapResponseDto> {
    const result = await this.replaceItems.execute({ id, tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return RoadmapMapper.toResponseDto(result.getValue());
  }

  @Put(':id/columns')
  @Roles(Role.ADMIN, Role.PRODUCT)
  @ApiOperation({ summary: 'Replace roadmap columns (pools)' })
  async putColumns(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReplaceRoadmapColumnsDto,
  ): Promise<RoadmapResponseDto> {
    const result = await this.replaceColumns.execute({ id, tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return RoadmapMapper.toResponseDto(result.getValue());
  }

  // Same gate as columns: how the board is organised is a product decision, so
  // anyone who can move a card still can't redraw the groups it moves between.
  @Put(':id/epics')
  @Roles(Role.ADMIN, Role.PRODUCT)
  @ApiOperation({ summary: 'Replace roadmap epics (item groups)' })
  async putEpics(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReplaceRoadmapEpicsDto,
  ): Promise<RoadmapResponseDto> {
    const result = await this.replaceEpics.execute({ id, tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return RoadmapMapper.toResponseDto(result.getValue());
  }

  @Post(':id/share')
  @Roles(Role.ADMIN, Role.PRODUCT)
  @ApiOperation({ summary: 'Toggle a roadmap public read-only link (admin/product)' })
  async share(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ShareRoadmapDto,
  ): Promise<RoadmapResponseDto> {
    const result = await this.setSharing.execute({
      id,
      tenantId: auth.tenantId,
      enabled: dto.enabled,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return RoadmapMapper.toResponseDto(result.getValue());
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a roadmap (admin)' })
  async remove(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    const result = await this.deleteRoadmap.execute({ id, tenantId: auth.tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return { ok: true };
  }
}
