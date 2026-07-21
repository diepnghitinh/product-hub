import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { resolveAssignees } from '@module-shared/utils/query-array.util';
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
        teamId: doc.teamId,
        shortId: doc.shortId,
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
        attachments: doc.attachments,
        labelKeys: doc.labelKeys,
        customFields: doc.customFields,
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
      teamId: bug.teamId,
      shortId: bug.shortId,
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
      attachments: bug.attachments,
      labelKeys: bug.labelKeys,
      customFields: bug.customFields,
      createdAt: bug.createdAt,
      updatedAt: bug.updatedAt,
    };
  }

  async findById(id: string): Promise<BugEntity | null> {
    const doc = await this.model.findById(id).lean<BugDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByRef(tenantId: string, ref: string): Promise<BugEntity | null> {
    // shortId first (the URL-facing id), then uuid for pre-shortId links.
    const doc =
      (await this.model.findOne({ tenantId, shortId: ref }).lean<BugDoc>().exec()) ??
      (await this.model.findOne({ tenantId, _id: ref }).lean<BugDoc>().exec());
    return doc ? this.toDomain(doc) : null;
  }

  async findWithoutShortId(): Promise<{ id: string; tenantId: string }[]> {
    const docs = await this.model
      .find({ $or: [{ shortId: { $exists: false } }, { shortId: '' }] }, { tenantId: 1 })
      .sort({ createdAt: 1 })
      .lean<{ _id: string; tenantId: string }[]>()
      .exec();
    return docs.map((d) => ({ id: d._id, tenantId: d.tenantId }));
  }

  async assignMissingTeam(tenantId: string, teamId: string): Promise<number> {
    const res = await this.model
      .updateMany(
        { tenantId, $or: [{ teamId: { $exists: false } }, { teamId: '' }] },
        { $set: { teamId } },
      )
      .exec();
    return res.modifiedCount ?? 0;
  }

  async setShortId(id: string, shortId: string): Promise<void> {
    await this.model.updateOne({ _id: id }, { $set: { shortId } }).exec();
  }

  async findByTenant(tenantId: string, query: QueryBugDto): Promise<BugPaginationResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 200;
    const filter: Record<string, unknown> = { tenantId };
    // Multi-value filters — a single value arrives as a 1-item array, so `$in`
    // is equivalent to the old equality match for existing callers.
    if (query.status?.length) filter.status = { $in: query.status };
    if (query.severity?.length) filter.severity = { $in: query.severity };
    if (query.assigneeId?.length) filter.assigneeId = { $in: resolveAssignees(query.assigneeId) };
    if (query.projectId?.length) filter.projectId = { $in: query.projectId };
    if (query.teamId) filter.teamId = query.teamId;
    if (query.caseId) filter.caseId = query.caseId;
    if (query.reportId) filter.reportId = query.reportId;
    if (query.search) {
      // Escaped: free text from the search box would otherwise throw on `(`.
      const re = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: re }, { description: re }, { _id: re }, { shortId: re }];
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
