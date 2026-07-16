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
  DeleteRoadmapUseCase,
} from '@application/roadmaps/use-cases/roadmap.use-cases';
import {
  CreateRoadmapDto,
  ReplaceRoadmapItemsDto,
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
    private readonly deleteRoadmap: DeleteRoadmapUseCase,
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
