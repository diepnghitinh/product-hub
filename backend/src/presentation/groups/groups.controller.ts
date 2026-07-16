import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { EntityNotFoundException } from '@core/exceptions';
import {
  CreateGroupUseCase,
  GetGroupsUseCase,
  UpdateGroupUseCase,
  ReorderGroupsUseCase,
  DeleteGroupUseCase,
} from '@application/groups/use-cases';
import { CreateGroupDto } from '@application/groups/dtos/create-group.dto';
import { UpdateGroupDto } from '@application/groups/dtos/update-group.dto';
import { ReorderGroupsDto } from '@application/groups/dtos/reorder-groups.dto';
import { GroupResponseDto } from '@application/groups/dtos/group.response.dto';
import { GroupMapper } from '@application/groups/mappers';

@ApiTags('Groups')
@ApiBearerAuth('JWT-auth')
@Controller('projects/:projectId/groups')
export class GroupsController {
  constructor(
    private readonly createGroup: CreateGroupUseCase,
    private readonly getGroups: GetGroupsUseCase,
    private readonly updateGroup: UpdateGroupUseCase,
    private readonly reorderGroups: ReorderGroupsUseCase,
    private readonly deleteGroup: DeleteGroupUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List a project’s groups (ordered)' })
  async list(
    @AuthUser() auth: JwtPayload,
    @Param('projectId') projectId: string,
  ): Promise<GroupResponseDto[]> {
    const result = await this.getGroups.execute({ tenantId: auth.tenantId, projectId });
    return GroupMapper.toResponseDtoArray(result.getValue());
  }

  @Post()
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Add a group to a project (admin)' })
  async create(
    @AuthUser() auth: JwtPayload,
    @Param('projectId') projectId: string,
    @Body() dto: CreateGroupDto,
  ): Promise<GroupResponseDto> {
    const result = await this.createGroup.execute({
      tenantId: auth.tenantId,
      projectId,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return GroupMapper.toResponseDto(result.getValue());
  }

  // Before ':id' so 'reorder' isn't captured as an id.
  @Post('reorder')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Reorder a project’s groups (admin)' })
  async reorder(
    @AuthUser() auth: JwtPayload,
    @Param('projectId') projectId: string,
    @Body() dto: ReorderGroupsDto,
  ): Promise<GroupResponseDto[]> {
    const result = await this.reorderGroups.execute({
      tenantId: auth.tenantId,
      projectId,
      ids: dto.ids,
    });
    return GroupMapper.toResponseDtoArray(result.getValue());
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Rename a group (admin)' })
  async update(
    @AuthUser() auth: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ): Promise<GroupResponseDto> {
    const result = await this.updateGroup.execute({
      id,
      tenantId: auth.tenantId,
      projectId,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return GroupMapper.toResponseDto(result.getValue());
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Remove a group and its features (admin)' })
  async remove(
    @AuthUser() auth: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    const result = await this.deleteGroup.execute({
      id,
      tenantId: auth.tenantId,
      projectId,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return { ok: true };
  }
}
