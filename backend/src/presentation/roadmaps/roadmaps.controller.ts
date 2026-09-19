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
  DeleteRoadmapUseCase,
  SetRoadmapSharingUseCase,
} from '@application/roadmaps/use-cases/roadmap.use-cases';
import {
  CreateRoadmapDto,
  ReplaceRoadmapColumnsDto,
  ReplaceRoadmapItemsDto,
  ShareRoadmapDto,
  UpdateRoadmapDto,
} from '@application/roadmaps/dtos/roadmap.dtos';
import { GetRoadmapProgressUseCase } from '@application/roadmaps/use-cases/roadmap-progress.use-case';
import { RoadmapResponseDto } from '@application/roadmaps/dtos/roadmap.response.dto';
import { RoadmapMapper } from '@application/roadmaps/mappers';
import { RoadmapEntity } from '@application/roadmaps/domain/entities/roadmap.entity';

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
    private readonly deleteRoadmap: DeleteRoadmapUseCase,
    private readonly setSharing: SetRoadmapSharingUseCase,
    private readonly getProgress: GetRoadmapProgressUseCase,
  ) {}

  /**
   * Every roadmap response, read or write, goes out through here.
   *
   * An item's `progress` is derived from the issues linked to it, so the value in
   * the document is never the answer — see `roadmapItemProgress`. Routing all
   * eight endpoints through one helper is what stops a write response (the board
   * re-renders from it) disagreeing with the next read.
   */
  private async toDto(tenantId: string, roadmap: RoadmapEntity): Promise<RoadmapResponseDto> {
    const progress = await this.getProgress.execute({ tenantId, items: roadmap.items });
    return RoadmapMapper.toResponseDto(roadmap, progress);
  }

  @Get()
  @ApiOperation({ summary: 'List roadmaps' })
  async list(@AuthUser() auth: JwtPayload): Promise<RoadmapResponseDto[]> {
    const roadmaps = (await this.getRoadmaps.execute({ tenantId: auth.tenantId })).getValue();
    // One aggregation for every item on every roadmap, rather than one per card.
    const progress = await this.getProgress.execute({
      tenantId: auth.tenantId,
      items: roadmaps.flatMap((r) => r.items),
    });
    return RoadmapMapper.toResponseDtoArray(roadmaps, progress);
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
    return this.toDto(auth.tenantId, result.getValue());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a roadmap' })
  async findOne(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<RoadmapResponseDto> {
    const result = await this.getRoadmap.execute({ id, tenantId: auth.tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return this.toDto(auth.tenantId, result.getValue());
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
    return this.toDto(auth.tenantId, result.getValue());
  }

  @Put(':id/items')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT)
  @ApiOperation({ summary: 'Replace roadmap items' })
  async putItems(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReplaceRoadmapItemsDto,
  ): Promise<RoadmapResponseDto> {
    const result = await this.replaceItems.execute({
      id,
      tenantId: auth.tenantId,
      dto,
      requesterId: auth.userId,
      requesterName: auth.name,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return this.toDto(auth.tenantId, result.getValue());
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
    return this.toDto(auth.tenantId, result.getValue());
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
    return this.toDto(auth.tenantId, result.getValue());
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a roadmap (admin)' })
  async remove(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    const result = await this.deleteRoadmap.execute({
      id,
      tenantId: auth.tenantId,
      // Every item in it gets a `deleted` row attributed to the caller.
      requesterId: auth.userId,
      requesterName: auth.name,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return { ok: true };
  }
}
