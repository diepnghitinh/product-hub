import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { EntityNotFoundException } from '@core/exceptions';
import { IServiceListResponse, ServiceResponse } from '@core/helpers';
import {
  CreateBugUseCase,
  GetBugsUseCase,
  GetBugUseCase,
  UpdateBugUseCase,
  SetBugStatusUseCase,
  DeleteBugUseCase,
} from '@application/bugs/use-cases';
import { CreateBugDto } from '@application/bugs/dtos/create-bug.dto';
import { UpdateBugDto } from '@application/bugs/dtos/update-bug.dto';
import { UpdateBugStatusDto } from '@application/bugs/dtos/update-bug-status.dto';
import { QueryBugDto } from '@application/bugs/dtos/query-bug.dto';
import { BugResponseDto } from '@application/bugs/dtos/bug.response.dto';
import { BugMapper } from '@application/bugs/mappers';

@ApiTags('Bugs')
@ApiBearerAuth('JWT-auth')
@Controller()
export class BugsController {
  constructor(
    private readonly createBug: CreateBugUseCase,
    private readonly getBugs: GetBugsUseCase,
    private readonly getBug: GetBugUseCase,
    private readonly updateBug: UpdateBugUseCase,
    private readonly setStatus: SetBugStatusUseCase,
    private readonly deleteBug: DeleteBugUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List bugs on the board (filterable)' })
  async list(
    @AuthUser() auth: JwtPayload,
    @Query() query: QueryBugDto,
  ): Promise<IServiceListResponse<BugResponseDto>> {
    const result = await this.getBugs.execute({ tenantId: auth.tenantId, query });
    const { data, total, page, limit } = result.getValue();
    return ServiceResponse.paginate(BugMapper.toResponseDtoArray(data), total, page, limit);
  }

  @Post()
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Report a bug' })
  async create(
    @AuthUser() auth: JwtPayload,
    @Body() dto: CreateBugDto,
  ): Promise<BugResponseDto> {
    const result = await this.createBug.execute({
      tenantId: auth.tenantId,
      reporterId: auth.userId,
      reporterName: auth.name,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return BugMapper.toResponseDto(result.getValue());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a bug' })
  async findOne(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<BugResponseDto> {
    const result = await this.getBug.execute({ id, tenantId: auth.tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return BugMapper.toResponseDto(result.getValue());
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Update a bug' })
  async update(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateBugDto,
  ): Promise<BugResponseDto> {
    const result = await this.updateBug.execute({ id, tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return BugMapper.toResponseDto(result.getValue());
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Move a bug to another column' })
  async changeStatus(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateBugStatusDto,
  ): Promise<BugResponseDto> {
    const result = await this.setStatus.execute({ id, tenantId: auth.tenantId, status: dto.status });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return BugMapper.toResponseDto(result.getValue());
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a bug (admin)' })
  async remove(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    const result = await this.deleteBug.execute({ id, tenantId: auth.tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return { ok: true };
  }
}
