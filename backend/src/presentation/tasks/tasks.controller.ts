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
  CreateTaskUseCase,
  GetTasksUseCase,
  GetTaskUseCase,
  UpdateTaskUseCase,
  SetTaskStatusUseCase,
  DeleteTaskUseCase,
} from '@application/tasks/use-cases';
import { CreateTaskDto } from '@application/tasks/dtos/create-task.dto';
import { UpdateTaskDto } from '@application/tasks/dtos/update-task.dto';
import { UpdateTaskStatusDto } from '@application/tasks/dtos/update-task-status.dto';
import { QueryTaskDto } from '@application/tasks/dtos/query-task.dto';
import { TaskResponseDto } from '@application/tasks/dtos/task.response.dto';
import { TaskMapper } from '@application/tasks/mappers';

@ApiTags('Tasks')
@ApiBearerAuth('JWT-auth')
@Controller()
export class TasksController {
  constructor(
    private readonly createTask: CreateTaskUseCase,
    private readonly getTasks: GetTasksUseCase,
    private readonly getTask: GetTaskUseCase,
    private readonly updateTask: UpdateTaskUseCase,
    private readonly setStatus: SetTaskStatusUseCase,
    private readonly deleteTask: DeleteTaskUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tasks (filter by backlog item, assignee, status)' })
  async list(
    @AuthUser() auth: JwtPayload,
    @Query() query: QueryTaskDto,
  ): Promise<IServiceListResponse<TaskResponseDto>> {
    const result = await this.getTasks.execute({
      tenantId: auth.tenantId,
      userId: auth.userId,
      query,
    });
    const { data, total, page, limit } = result.getValue();
    return ServiceResponse.paginate(TaskMapper.toResponseDtoArray(data), total, page, limit);
  }

  @Post()
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Write a task' })
  async create(
    @AuthUser() auth: JwtPayload,
    @Body() dto: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    const result = await this.createTask.execute({
      tenantId: auth.tenantId,
      createdBy: auth.userId,
      createdByName: auth.name,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return TaskMapper.toResponseDto(result.getValue());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a task' })
  async findOne(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<TaskResponseDto> {
    const result = await this.getTask.execute({
      id,
      tenantId: auth.tenantId,
      requesterId: auth.userId,
      isAdmin: auth.role === Role.ADMIN,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return TaskMapper.toResponseDto(result.getValue());
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Update a task' })
  async update(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    const result = await this.updateTask.execute({
      id,
      tenantId: auth.tenantId,
      requesterId: auth.userId,
      isAdmin: auth.role === Role.ADMIN,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return TaskMapper.toResponseDto(result.getValue());
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Change a task status (todo/in-progress/done)' })
  async changeStatus(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTaskStatusDto,
  ): Promise<TaskResponseDto> {
    const result = await this.setStatus.execute({
      id,
      tenantId: auth.tenantId,
      requesterId: auth.userId,
      isAdmin: auth.role === Role.ADMIN,
      status: dto.status,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return TaskMapper.toResponseDto(result.getValue());
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({ summary: 'Delete a task' })
  async remove(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    const result = await this.deleteTask.execute({
      id,
      tenantId: auth.tenantId,
      requesterId: auth.userId,
      isAdmin: auth.role === Role.ADMIN,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return { ok: true };
  }
}
