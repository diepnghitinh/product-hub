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
  CreateIssueUseCase,
  GetIssuesUseCase,
  GetIssueUseCase,
  UpdateIssueUseCase,
  SetIssueStatusUseCase,
  DeleteIssueUseCase,
} from '@application/issues/use-cases';
import { CreateIssueDto } from '@application/issues/dtos/create-issue.dto';
import { UpdateIssueDto } from '@application/issues/dtos/update-issue.dto';
import { UpdateIssueStatusDto } from '@application/issues/dtos/update-issue-status.dto';
import { QueryIssueDto } from '@application/issues/dtos/query-issue.dto';
import { IssueResponseDto } from '@application/issues/dtos/issue.response.dto';
import { IssueMapper } from '@application/issues/mappers';

/**
 * The unified issues API — one endpoint for both tasks and bugs, told apart by
 * `kind`. Replaces the separate /tasks and /bugs controllers.
 */
@ApiTags('Issues')
@ApiBearerAuth('JWT-auth')
@Controller()
export class IssuesController {
  constructor(
    private readonly createIssue: CreateIssueUseCase,
    private readonly getIssues: GetIssuesUseCase,
    private readonly getIssue: GetIssueUseCase,
    private readonly updateIssue: UpdateIssueUseCase,
    private readonly setStatus: SetIssueStatusUseCase,
    private readonly deleteIssue: DeleteIssueUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List issues (filter by kind, team, assignee, status, backlog item…)' })
  async list(
    @AuthUser() auth: JwtPayload,
    @Query() query: QueryIssueDto,
  ): Promise<IServiceListResponse<IssueResponseDto>> {
    const result = await this.getIssues.execute({
      tenantId: auth.tenantId,
      userId: auth.userId,
      query,
    });
    const { data, total, page, limit } = result.getValue();
    return ServiceResponse.paginate(IssueMapper.toResponseDtoArray(data), total, page, limit);
  }

  @Post()
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Create an issue (task or bug)' })
  async create(
    @AuthUser() auth: JwtPayload,
    @Body() dto: CreateIssueDto,
  ): Promise<IssueResponseDto> {
    const result = await this.createIssue.execute({
      tenantId: auth.tenantId,
      createdBy: auth.userId,
      createdByName: auth.name,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return IssueMapper.toResponseDto(result.getValue());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an issue' })
  async findOne(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<IssueResponseDto> {
    const result = await this.getIssue.execute({
      id,
      tenantId: auth.tenantId,
      requesterId: auth.userId,
      isAdmin: auth.role === Role.ADMIN,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return IssueMapper.toResponseDto(result.getValue());
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Update an issue' })
  async update(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateIssueDto,
  ): Promise<IssueResponseDto> {
    const result = await this.updateIssue.execute({
      id,
      tenantId: auth.tenantId,
      requesterId: auth.userId,
      isAdmin: auth.role === Role.ADMIN,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return IssueMapper.toResponseDto(result.getValue());
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Move an issue to another status column' })
  async changeStatus(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateIssueStatusDto,
  ): Promise<IssueResponseDto> {
    const result = await this.setStatus.execute({
      id,
      tenantId: auth.tenantId,
      requesterId: auth.userId,
      isAdmin: auth.role === Role.ADMIN,
      status: dto.status,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return IssueMapper.toResponseDto(result.getValue());
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Delete an issue (deleting a bug is admin/product only)' })
  async remove(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    const result = await this.deleteIssue.execute({
      id,
      tenantId: auth.tenantId,
      requesterId: auth.userId,
      isAdmin: auth.role === Role.ADMIN,
      // Bugs were admin/product-only to delete; tasks stay deletable by the broader
      // board-write roles (their owner-or-admin check is enforced in the use-case).
      canDeleteBug: auth.role === Role.ADMIN || auth.role === Role.PRODUCT,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return { ok: true };
  }
}
