import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConflictException, EntityNotFoundException } from '@core/exceptions';
import { TenantStatus } from '@application/tenants/domain/entities/tenant.props';
import {
  CreateTenantDto,
  PlatformOverviewDto,
  QueryTenantsDto,
  TenantDetailResponseDto,
  TenantListResponseDto,
  TenantResponseDto,
  UpdateTenantDto,
} from '@application/platform/dtos/tenant.dtos';
import { PlatformAuth } from '@application/platform/services/platform-auth.guard';
import {
  CreateTenantUseCase,
  GetPlatformOverviewUseCase,
  GetTenantDetailUseCase,
  ListTenantsUseCase,
  SetTenantStatusUseCase,
  UpdateTenantUseCase,
} from '@application/platform/use-cases/platform-tenant.use-cases';

@ApiTags('Platform · Tenants')
@PlatformAuth()
@Controller('tenants')
export class PlatformTenantsController {
  constructor(
    private readonly listUseCase: ListTenantsUseCase,
    private readonly detailUseCase: GetTenantDetailUseCase,
    private readonly createUseCase: CreateTenantUseCase,
    private readonly updateUseCase: UpdateTenantUseCase,
    private readonly setStatusUseCase: SetTenantStatusUseCase,
    private readonly overviewUseCase: GetPlatformOverviewUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List every workspace on the platform' })
  async list(@Query() query: QueryTenantsDto): Promise<TenantListResponseDto> {
    const result = await this.listUseCase.execute({ query });
    return result.getValue();
  }

  /**
   * Declared before `:id` — Nest matches routes in order, so a literal segment
   * that shares a prefix with a param has to come first or it never matches.
   */
  @Get('overview')
  @ApiOperation({ summary: 'Platform-wide rollup for the console home' })
  async overview(): Promise<PlatformOverviewDto> {
    const result = await this.overviewUseCase.execute();
    return result.getValue();
  }

  @Get(':id')
  @ApiOperation({ summary: 'One workspace with its entitlements and usage' })
  async detail(@Param('id') id: string): Promise<TenantDetailResponseDto> {
    const result = await this.detailUseCase.execute({ id });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return result.getValue();
  }

  @Post()
  @ApiOperation({ summary: 'Create a workspace and its first admin' })
  async create(@Body() dto: CreateTenantDto): Promise<TenantResponseDto> {
    const result = await this.createUseCase.execute({ dto });
    if (result.isFailure) throw new ConflictException(result.error as string);
    return result.getValue();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a workspace' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<TenantResponseDto> {
    const result = await this.updateUseCase.execute({ id, dto });
    if (result.isFailure) throw new ConflictException(result.error as string);
    return result.getValue();
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspend a workspace (blocks sign-in, keeps data)' })
  async suspend(@Param('id') id: string): Promise<TenantResponseDto> {
    const result = await this.setStatusUseCase.execute({
      id,
      status: TenantStatus.SUSPENDED,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return result.getValue();
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Lift a suspension' })
  async activate(@Param('id') id: string): Promise<TenantResponseDto> {
    const result = await this.setStatusUseCase.execute({
      id,
      status: TenantStatus.ACTIVE,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return result.getValue();
  }
}
