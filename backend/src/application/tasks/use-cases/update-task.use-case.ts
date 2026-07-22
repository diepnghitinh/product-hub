import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { UpdateTaskDto } from '../dtos/update-task.dto';
import { TaskEntity } from '../domain/entities/task.entity';
import { ITaskRepository } from '../repositories/task.repository';

export interface UpdateTaskRequest {
  id: string;
  tenantId: string;
  /** The caller — a personal task is only editable by its owner or an admin. */
  requesterId: string;
  isAdmin: boolean;
  dto: UpdateTaskDto;
}

@Injectable()
export class UpdateTaskUseCase
  implements IUsecaseExecute<UpdateTaskRequest, Result<TaskEntity>>
{
  constructor(
    @Inject(ITaskRepository) private readonly tasks: ITaskRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
  ) {}

  async execute({ id, tenantId, requesterId, isAdmin, dto }: UpdateTaskRequest): Promise<Result<TaskEntity>> {
    const task = await this.tasks.findById(id);
    if (!task || task.tenantId !== tenantId) return Result.fail('Task not found');
    // A personal task can only be edited by its owner (or an admin).
    if (!task.isVisibleTo(requesterId, isAdmin)) return Result.fail('Task not found');

    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId === '') {
        task.assign('', '');
      } else {
        const assignee = await this.users.findById(dto.assigneeId);
        if (!assignee || assignee.tenantId !== tenantId) {
          return Result.fail('Assignee not found');
        }
        task.assign(assignee.id.toString(), assignee.name);
      }
    }

    task.applyUpdate({
      title: dto.title,
      description: dto.description,
      parentId: dto.parentId,
      roadmapId: dto.roadmapId,
      roadmapItemId: dto.roadmapItemId,
      roadmapItemLabel: dto.roadmapItemLabel,
      projectId: dto.projectId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      dueDate: dto.dueDate,
      estimate: dto.estimate,
      labelKeys: dto.labelKeys,
      customFields: dto.customFields,
    });

    await this.tasks.update(task);
    return Result.ok(task);
  }
}
