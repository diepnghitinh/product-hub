import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ConflictException,
  EntityNotFoundException,
  ValidationException,
} from '@core/exceptions';
import {
  CreatePlanDto,
  FeatureCatalogItemDto,
  PlanResponseDto,
  UpdatePlanDto,
} from '@application/platform/dtos/plan.dtos';
import { PlanMapper } from '@application/platform/mappers/platform.mapper';
import { PlatformAuth } from '@application/platform/services/platform-auth.guard';
import {
  CreatePlanUseCase,
  DeletePlanUseCase,
  GetPlanUseCase,
  ListPlansUseCase,
  UpdatePlanUseCase,
} from '@application/platform/use-cases/plan.use-cases';

@ApiTags('Platform · Plans')
@PlatformAuth()
@Controller('plans')
export class PlatformPlansController {
  constructor(
    private readonly listUseCase: ListPlansUseCase,
    private readonly getUseCase: GetPlanUseCase,
    private readonly createUseCase: CreatePlanUseCase,
    private readonly updateUseCase: UpdatePlanUseCase,
    private readonly deleteUseCase: DeletePlanUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List plans with their resolved entitlements' })
  async list(): Promise<PlanResponseDto[]> {
    const result = await this.listUseCase.execute();
    return result.getValue();
  }

  /**
   * The feature catalog is served rather than shipped with the console, so the
   * two can never disagree about what a plan is allowed to grant.
   */
  @Get('features')
  @ApiOperation({ summary: 'Every feature a plan can grant' })
  features(): FeatureCatalogItemDto[] {
    return PlanMapper.featureCatalog();
  }

  @Get(':id')
  @ApiOperation({ summary: 'One plan, by id or code' })
  async get(@Param('id') id: string): Promise<PlanResponseDto> {
    const result = await this.getUseCase.execute({ id });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return result.getValue();
  }

  @Post()
  @ApiOperation({ summary: 'Create a plan' })
  async create(@Body() dto: CreatePlanDto): Promise<PlanResponseDto> {
    const result = await this.createUseCase.execute({ dto });
    if (result.isFailure) throw new ConflictException(result.error as string);
    return result.getValue();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a plan' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
  ): Promise<PlanResponseDto> {
    const result = await this.updateUseCase.execute({ id, dto });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a plan nobody is on' })
  async remove(@Param('id') id: string): Promise<{ success: boolean }> {
    const result = await this.deleteUseCase.execute({ id });
    if (result.isFailure) throw new ConflictException(result.error as string);
    return { success: true };
  }
}
