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

  async execute({ id, tenantId, dto }: UpdateTaskRequest): Promise<Result<TaskEntity>> {
    const task = await this.tasks.findById(id);
    if (!task || task.tenantId !== tenantId) return Result.fail('Task not found');

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
      roadmapId: dto.roadmapId,
      roadmapItemId: dto.roadmapItemId,
      roadmapItemLabel: dto.roadmapItemLabel,
      projectId: dto.projectId,
      dueDate: dto.dueDate,
    });

    await this.tasks.update(task);
    return Result.ok(task);
  }
}
