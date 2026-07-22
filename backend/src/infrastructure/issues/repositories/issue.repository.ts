import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { resolveAssignees } from '@module-shared/utils/query-array.util';
import {
  IssuePaginationResponse,
  IIssueRepository,
} from '@application/issues/repositories/issue.repository';
import { IssueEntity } from '@application/issues/domain/entities/issue.entity';
import { BugSeverity, IssueKind } from '@application/issues/domain/enums/issue.enums';
import { QueryIssueDto } from '@application/issues/dtos/query-issue.dto';
import { IssueDoc } from '../entities/issue.schema';

@Injectable()
export class IssueRepository
  extends BaseRepository<IssueEntity, IssueDoc>
  implements IIssueRepository
{
  constructor(@InjectModel('Issue') model: Model<IssueDoc>) {
    super(model);
  }

  toDomain(doc: IssueDoc): IssueEntity {
    const result = IssueEntity.create(
      {
        kind: doc.kind as IssueKind,
        tenantId: doc.tenantId,
        teamId: doc.teamId,
        ownerId: doc.ownerId,
        parentId: doc.parentId,
        shortId: doc.shortId,
        title: doc.title,
        description: doc.description,
        status: doc.status,
        roadmapId: doc.roadmapId,
        roadmapItemId: doc.roadmapItemId,
        roadmapItemLabel: doc.roadmapItemLabel,
        projectId: doc.projectId,
        assigneeId: doc.assigneeId,
        assigneeName: doc.assigneeName,
        createdBy: doc.createdBy,
        createdByName: doc.createdByName,
        reporterId: doc.reporterId,
        reporterName: doc.reporterName,
        startDate: doc.startDate,
        endDate: doc.endDate,
        dueDate: doc.dueDate,
        estimate: doc.estimate,
        severity: doc.severity as BugSeverity | '',
        type: doc.type,
        caseId: doc.caseId,
        caseLabel: doc.caseLabel,
        reportId: doc.reportId,
        attachments: doc.attachments,
        labelKeys: doc.labelKeys,
        customFields: doc.customFields,
        order: doc.order,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(issue: IssueEntity): Partial<IssueDoc> {
    return {
      _id: issue.id.toString(),
      kind: issue.kind,
      tenantId: issue.tenantId,
      teamId: issue.teamId,
      ownerId: issue.ownerId,
      parentId: issue.parentId,
      shortId: issue.shortId,
      title: issue.title,
      description: issue.description,
      status: issue.status,
      roadmapId: issue.roadmapId,
      roadmapItemId: issue.roadmapItemId,
      roadmapItemLabel: issue.roadmapItemLabel,
      projectId: issue.projectId,
      assigneeId: issue.assigneeId,
      assigneeName: issue.assigneeName,
      createdBy: issue.createdBy,
      createdByName: issue.createdByName,
      reporterId: issue.reporterId,
      reporterName: issue.reporterName,
      startDate: issue.startDate,
      endDate: issue.endDate,
      dueDate: issue.dueDate,
      estimate: issue.estimate,
      severity: issue.severity,
      type: issue.type,
      caseId: issue.caseId,
      caseLabel: issue.caseLabel,
      reportId: issue.reportId,
      attachments: issue.attachments,
      labelKeys: issue.labelKeys,
      customFields: issue.customFields,
      order: issue.order,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    };
  }

  async findById(id: string): Promise<IssueEntity | null> {
    const doc = await this.model.findById(id).lean<IssueDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByRef(tenantId: string, ref: string): Promise<IssueEntity | null> {
    // shortId first (the URL-facing id), then uuid for pre-shortId links.
    const doc =
      (await this.model.findOne({ tenantId, shortId: ref }).lean<IssueDoc>().exec()) ??
      (await this.model.findOne({ tenantId, _id: ref }).lean<IssueDoc>().exec());
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

  async findByTenant(
    tenantId: string,
    query: QueryIssueDto,
    opts?: { personalOwnerId?: string },
  ): Promise<IssuePaginationResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 200;
    const filter: Record<string, unknown> = { tenantId };
    // The privacy boundary. A personal task (ownerId set) lives on exactly one
    // user's private board; `personalOwnerId` scopes the query to that owner.
    // *Every other* view passes no owner, so it filters `ownerId: ''` — personal
    // tasks are thereby excluded from all team lists and "assigned to me", and all
    // bugs (ownerId '') pass through. This is the single chokepoint that keeps
    // private tasks private; do not remove it.
    filter.ownerId = opts?.personalOwnerId ?? '';
    // Multi-value filters — a single value arrives as a 1-item array, so `$in`
    // is equivalent to the old equality match for existing callers.
    if (query.kind?.length) filter.kind = { $in: query.kind };
    if (query.status?.length) filter.status = { $in: query.status };
    if (query.severity?.length) filter.severity = { $in: query.severity };
    if (query.assigneeId?.length) filter.assigneeId = { $in: resolveAssignees(query.assigneeId) };
    if (query.parentId?.length) filter.parentId = { $in: query.parentId };
    if (query.roadmapItemId?.length) filter.roadmapItemId = { $in: query.roadmapItemId };
    if (query.roadmapId?.length) filter.roadmapId = { $in: query.roadmapId };
    if (query.projectId?.length) filter.projectId = { $in: query.projectId };
    if (query.teamId) filter.teamId = query.teamId;
    if (query.caseId) filter.caseId = query.caseId;
    if (query.reportId) filter.reportId = query.reportId;
    // "Assigned to me": strictly the issues assigned to me — this wins over any
    // explicit assignee filter, so it's set after the assigneeId clause above.
    if (query.mine) filter.assigneeId = query.mine;
    if (query.search) {
      // Escaped: free text from a search box would otherwise throw on `(`.
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'i');
      // Name or id — the picker accepts a pasted id (`_id` is a uuid string).
      const searchOr = [{ title: re }, { description: re }, { _id: re }, { shortId: re }];
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
        .lean<IssueDoc[]>()
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

  async save(issue: IssueEntity): Promise<void> {
    const doc = this.toDocument(issue);
    await this.model
      .findByIdAndUpdate(doc._id, doc, { upsert: true, setDefaultsOnInsert: true, new: true })
      .exec();
  }

  async update(issue: IssueEntity): Promise<void> {
    await this.save(issue);
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }
}
