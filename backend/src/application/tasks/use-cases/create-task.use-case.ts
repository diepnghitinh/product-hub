import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { CreateTaskDto } from '../dtos/create-task.dto';
import { TaskEntity } from '../domain/entities/task.entity';
import { ITaskRepository } from '../repositories/task.repository';

export interface CreateTaskRequest {
  tenantId: string;
  createdBy: string;
  createdByName: string;
  dto: CreateTaskDto;
}

@Injectable()
export class CreateTaskUseCase
  implements IUsecaseExecute<CreateTaskRequest, Result<TaskEntity>>
{
  constructor(
    @Inject(ITaskRepository) private readonly tasks: ITaskRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
  ) {}

  async execute({
    tenantId,
    createdBy,
    createdByName,
    dto,
  }: CreateTaskRequest): Promise<Result<TaskEntity>> {
    let assigneeName = '';
    if (dto.assigneeId) {
      const assignee = await this.users.findById(dto.assigneeId);
      if (!assignee || assignee.tenantId !== tenantId) {
        return Result.fail('Assignee not found');
      }
      assigneeName = assignee.name;
    }

    const created = TaskEntity.create({
      tenantId,
      title: dto.title,
      description: dto.description,
      status: dto.status,
      roadmapId: dto.roadmapId,
      roadmapItemId: dto.roadmapItemId,
      roadmapItemLabel: dto.roadmapItemLabel,
      projectId: dto.projectId,
      assigneeId: dto.assigneeId,
      assigneeName,
      createdBy,
      createdByName,
      dueDate: dto.dueDate,
    });
    if (created.isFailure) return Result.fail(created.error as string);

    const task = created.getValue();
    await this.tasks.save(task);
    return Result.ok(task);
  }
}
