import { TaskEntity } from '../domain/entities/task.entity';
import { TaskResponseDto } from '../dtos/task.response.dto';

export class TaskMapper {
  static toResponseDto(task: TaskEntity): TaskResponseDto {
    return {
      id: task.id.toString(),
      tenantId: task.tenantId,
      teamId: task.teamId,
      ownerId: task.ownerId,
      parentId: task.parentId,
      shortId: task.shortId,
      title: task.title,
      description: task.description,
      status: task.status,
      roadmapId: task.roadmapId,
      roadmapItemId: task.roadmapItemId,
      roadmapItemLabel: task.roadmapItemLabel,
      projectId: task.projectId,
      assigneeId: task.assigneeId,
      assigneeName: task.assigneeName,
      createdBy: task.createdBy,
      createdByName: task.createdByName,
      startDate: task.startDate,
      endDate: task.endDate,
      dueDate: task.dueDate,
      estimate: task.estimate,
      labelKeys: task.labelKeys,
      customFields: task.customFields,
      order: task.order,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  static toResponseDtoArray(tasks: TaskEntity[]): TaskResponseDto[] {
    return tasks.map((t) => this.toResponseDto(t));
  }
}
