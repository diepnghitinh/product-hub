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
  CreateProjectUseCase,
  GetProjectsUseCase,
  GetProjectUseCase,
  UpdateProjectUseCase,
  ArchiveProjectUseCase,
  RestoreProjectUseCase,
  DeleteProjectUseCase,
  SetProjectSharingUseCase,
} from '@application/projects/use-cases';
import { CreateProjectDto } from '@application/projects/dtos/create-project.dto';
import { UpdateProjectDto } from '@application/projects/dtos/update-project.dto';
import { QueryProjectDto } from '@application/projects/dtos/query-project.dto';
import { ShareProjectDto } from '@application/projects/dtos/share-project.dto';
import { ProjectResponseDto } from '@application/projects/dtos/project.response.dto';
import { ProjectMapper } from '@application/projects/mappers';

@ApiTags('Projects')
@ApiBearerAuth('JWT-auth')
@Controller()
export class ProjectsController {
  constructor(
    private readonly createProject: CreateProjectUseCase,
    private readonly getProjects: GetProjectsUseCase,
    private readonly getProject: GetProjectUseCase,
    private readonly updateProject: UpdateProjectUseCase,
    private readonly archiveProject: ArchiveProjectUseCase,
    private readonly restoreProject: RestoreProjectUseCase,
    private readonly deleteProject: DeleteProjectUseCase,
    private readonly setSharing: SetProjectSharingUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List active projects in your tenant' })
  async list(
    @AuthUser() auth: JwtPayload,
    @Query() query: QueryProjectDto,
  ): Promise<IServiceListResponse<ProjectResponseDto>> {
    query.archived = false;
    const result = await this.getProjects.execute({ tenantId: auth.tenantId, query });
    const { data, total, page, limit } = result.getValue();
    return ServiceResponse.paginate(
      ProjectMapper.toResponseDtoArray(data),
      total,
      page,
      limit,
    );
  }

  // Declared before ':id' so it isn't captured as an id param.
  @Get('archived')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List archived projects (admin)' })
  async listArchived(
    @AuthUser() auth: JwtPayload,
    @Query() query: QueryProjectDto,
  ): Promise<IServiceListResponse<ProjectResponseDto>> {
    query.archived = true;
    const result = await this.getProjects.execute({ tenantId: auth.tenantId, query });
    const { data, total, page, limit } = result.getValue();
    return ServiceResponse.paginate(
      ProjectMapper.toResponseDtoArray(data),
      total,
      page,
      limit,
    );
  }

  @Post()
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Create a project' })
  async create(
    @AuthUser() auth: JwtPayload,
    @Body() dto: CreateProjectDto,
  ): Promise<ProjectResponseDto> {
    const result = await this.createProject.execute({
      tenantId: auth.tenantId,
      userId: auth.userId,
      userName: auth.name,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return ProjectMapper.toResponseDto(result.getValue());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a project by id' })
  async findOne(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<ProjectResponseDto> {
    const result = await this.getProject.execute({ id, tenantId: auth.tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return ProjectMapper.toResponseDto(result.getValue());
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Update a project (title/subtitle/owner/environment/pin)' })
  async update(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectResponseDto> {
    const result = await this.updateProject.execute({ id, tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return ProjectMapper.toResponseDto(result.getValue());
  }

  @Post(':id/archive')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Archive (soft-delete) a project' })
  async archive(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<ProjectResponseDto> {
    const result = await this.archiveProject.execute({ id, tenantId: auth.tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return ProjectMapper.toResponseDto(result.getValue());
  }

  @Post(':id/share')
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Enable/disable the project’s public link' })
  async share(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ShareProjectDto,
  ): Promise<ProjectResponseDto> {
    const result = await this.setSharing.execute({
      id,
      tenantId: auth.tenantId,
      enabled: dto.enabled,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return ProjectMapper.toResponseDto(result.getValue());
  }

  @Post(':id/restore')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Restore an archived project' })
  async restore(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<ProjectResponseDto> {
    const result = await this.restoreProject.execute({ id, tenantId: auth.tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return ProjectMapper.toResponseDto(result.getValue());
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Permanently delete a project (admin)' })
  async remove(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    const result = await this.deleteProject.execute({ id, tenantId: auth.tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return { ok: true };
  }
}
