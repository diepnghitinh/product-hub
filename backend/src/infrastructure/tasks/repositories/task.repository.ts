import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { resolveAssignees } from '@module-shared/utils/query-array.util';
import {
  TaskPaginationResponse,
  ITaskRepository,
} from '@application/tasks/repositories/task.repository';
import { TaskEntity } from '@application/tasks/domain/entities/task.entity';
import { TaskStatus } from '@application/tasks/domain/enums/task.enums';
import { QueryTaskDto } from '@application/tasks/dtos/query-task.dto';
import { TaskDoc } from '../entities/task.schema';

@Injectable()
export class TaskRepository
  extends BaseRepository<TaskEntity, TaskDoc>
  implements ITaskRepository
{
  constructor(@InjectModel('Task') model: Model<TaskDoc>) {
    super(model);
  }

  toDomain(doc: TaskDoc): TaskEntity {
    const result = TaskEntity.create(
      {
        tenantId: doc.tenantId,
        title: doc.title,
        description: doc.description,
        status: doc.status as TaskStatus,
        roadmapId: doc.roadmapId,
        roadmapItemId: doc.roadmapItemId,
        roadmapItemLabel: doc.roadmapItemLabel,
        projectId: doc.projectId,
        assigneeId: doc.assigneeId,
        assigneeName: doc.assigneeName,
        createdBy: doc.createdBy,
        createdByName: doc.createdByName,
        dueDate: doc.dueDate,
        order: doc.order,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(task: TaskEntity): Partial<TaskDoc> {
    return {
      _id: task.id.toString(),
      tenantId: task.tenantId,
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
      dueDate: task.dueDate,
      order: task.order,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  async findById(id: string): Promise<TaskEntity | null> {
    const doc = await this.model.findById(id).lean<TaskDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByTenant(tenantId: string, query: QueryTaskDto): Promise<TaskPaginationResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 200;
    const filter: Record<string, unknown> = { tenantId };
    // Multi-value filters — a single value arrives as a 1-item array, so `$in`
    // is equivalent to the old equality match for existing callers.
    if (query.status?.length) filter.status = { $in: query.status };
    if (query.assigneeId?.length) filter.assigneeId = { $in: resolveAssignees(query.assigneeId) };
    if (query.roadmapItemId?.length) filter.roadmapItemId = { $in: query.roadmapItemId };
    if (query.roadmapId?.length) filter.roadmapId = { $in: query.roadmapId };
    if (query.projectId?.length) filter.projectId = { $in: query.projectId };
    // "My tasks": assigned to me OR created by me (so tasks I create always show).
    if (query.mine) {
      filter.$or = [{ assigneeId: query.mine }, { createdBy: query.mine }];
    }
    if (query.search) {
      // Escaped: the task picker's search box takes free text, so an unbalanced
      // "(" would otherwise throw on RegExp construction.
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'i');
      // Name or task id — the picker accepts a pasted id (`_id` is a uuid string).
      const searchOr = [{ title: re }, { description: re }, { _id: re }];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
        delete filter.$or;
      } else {
        filter.$or = searchOr;
      }
    }

    const [docs, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ order: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<TaskDoc[]>()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return {
      data: docs.map((d) => this.toDomain(d)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async save(task: TaskEntity): Promise<void> {
    const doc = this.toDocument(task);
    await this.model
      .findByIdAndUpdate(doc._id, doc, { upsert: true, setDefaultsOnInsert: true, new: true })
      .exec();
  }

  async update(task: TaskEntity): Promise<void> {
    await this.save(task);
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }
}
