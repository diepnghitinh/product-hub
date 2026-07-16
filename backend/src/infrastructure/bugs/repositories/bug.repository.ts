import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import {
  BugPaginationResponse,
  IBugRepository,
} from '@application/bugs/repositories/bug.repository';
import { BugEntity } from '@application/bugs/domain/entities/bug.entity';
import { BugSeverity, BugStatus } from '@application/bugs/domain/enums/bug.enums';
import { QueryBugDto } from '@application/bugs/dtos/query-bug.dto';
import { BugDoc } from '../entities/bug.schema';

@Injectable()
export class BugRepository
  extends BaseRepository<BugEntity, BugDoc>
  implements IBugRepository
{
  constructor(@InjectModel('Bug') model: Model<BugDoc>) {
    super(model);
  }

  toDomain(doc: BugDoc): BugEntity {
    const result = BugEntity.create(
      {
        tenantId: doc.tenantId,
        title: doc.title,
        description: doc.description,
        severity: doc.severity as BugSeverity,
        status: doc.status as BugStatus,
        type: doc.type,
        projectId: doc.projectId,
        caseId: doc.caseId,
        caseLabel: doc.caseLabel,
        reportId: doc.reportId,
        assigneeId: doc.assigneeId,
        assigneeName: doc.assigneeName,
        reporterId: doc.reporterId,
        reporterName: doc.reporterName,
        order: doc.order,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(bug: BugEntity): Partial<BugDoc> {
    return {
      _id: bug.id.toString(),
      tenantId: bug.tenantId,
      title: bug.title,
      description: bug.description,
      severity: bug.severity,
      status: bug.status,
      type: bug.type,
      projectId: bug.projectId,
      caseId: bug.caseId,
      caseLabel: bug.caseLabel,
      reportId: bug.reportId,
      assigneeId: bug.assigneeId,
      assigneeName: bug.assigneeName,
      reporterId: bug.reporterId,
      reporterName: bug.reporterName,
      order: bug.order,
      createdAt: bug.createdAt,
      updatedAt: bug.updatedAt,
    };
  }

  async findById(id: string): Promise<BugEntity | null> {
    const doc = await this.model.findById(id).lean<BugDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByTenant(tenantId: string, query: QueryBugDto): Promise<BugPaginationResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 200;
    const filter: Record<string, unknown> = { tenantId };
    if (query.status) filter.status = query.status;
    if (query.severity) filter.severity = query.severity;
    if (query.assigneeId) filter.assigneeId = query.assigneeId;
    if (query.projectId) filter.projectId = query.projectId;
    if (query.caseId) filter.caseId = query.caseId;
    if (query.reportId) filter.reportId = query.reportId;
    if (query.search) {
      const re = new RegExp(query.search, 'i');
      filter.$or = [{ title: re }, { description: re }];
    }

    const [docs, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ order: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<BugDoc[]>()
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

  async countByStatus(tenantId: string, status: string): Promise<number> {
    return this.model.countDocuments({ tenantId, status }).exec();
  }

  async save(bug: BugEntity): Promise<void> {
    const doc = this.toDocument(bug);
    await this.model
      .findByIdAndUpdate(doc._id, doc, { upsert: true, setDefaultsOnInsert: true, new: true })
      .exec();
  }

  async update(bug: BugEntity): Promise<void> {
    await this.save(bug);
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }
}
