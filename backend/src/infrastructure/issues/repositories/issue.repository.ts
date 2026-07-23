import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { resolveAssignees } from '@module-shared/utils/query-array.util';
import { CycleRollup } from '@application/cycles/domain/enums/cycle.enums';
import { BurndownIssueRow } from '@application/cycles/domain/cycle-burndown';
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
        cycleId: doc.cycleId,
        carryOverCount: doc.carryOverCount,
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
      cycleId: issue.cycleId,
      carryOverCount: issue.carryOverCount,
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
    // Direct id fetch (still tenant- and privacy-scoped) — how a closed cycle's
    // frozen `unfinishedIds` become visible issues again.
    if (query.ids?.length) filter._id = { $in: query.ids };
    if (query.status?.length) filter.status = { $in: query.status };
    if (query.severity?.length) filter.severity = { $in: query.severity };
    if (query.assigneeId?.length) filter.assigneeId = { $in: resolveAssignees(query.assigneeId) };
    if (query.parentId?.length) filter.parentId = { $in: query.parentId };
    if (query.roadmapItemId?.length) filter.roadmapItemId = { $in: query.roadmapItemId };
    if (query.roadmapId?.length) filter.roadmapId = { $in: query.roadmapId };
    if (query.projectId?.length) filter.projectId = { $in: query.projectId };
    if (query.teamId) filter.teamId = query.teamId;
    // '' is meaningful here (issues in no cycle) — sentinels like `current` were
    // already resolved to a real id (or a no-match id) by the use-case.
    if (query.cycleId !== undefined) filter.cycleId = query.cycleId;
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

  async cycleRollups(
    tenantId: string,
    cycleIds: string[],
    completedStatusKeys: string[],
  ): Promise<Record<string, CycleRollup>> {
    if (!cycleIds.length) return {};
    const rows = await this.model
      .aggregate<{ _id: string } & CycleRollup>([
        { $match: { tenantId, cycleId: { $in: cycleIds } } },
        {
          $group: {
            _id: '$cycleId',
            scopeCount: { $sum: 1 },
            scopePoints: { $sum: { $ifNull: ['$estimate', 0] } },
            completedCount: {
              $sum: { $cond: [{ $in: ['$status', completedStatusKeys] }, 1, 0] },
            },
            completedPoints: {
              $sum: {
                $cond: [{ $in: ['$status', completedStatusKeys] }, { $ifNull: ['$estimate', 0] }, 0],
              },
            },
            // Who is NOT done — the ids the boundary sweep will move away.
            // Same pass as the stats, so the frozen record can't disagree
            // with them (completedCount + unfinishedIds.length === scopeCount).
            unfinishedIds: {
              $push: { $cond: [{ $in: ['$status', completedStatusKeys] }, null, '$_id'] },
            },
          },
        },
        // $push can't skip, so finished issues left null placeholders — drop them.
        {
          $addFields: {
            unfinishedIds: {
              $filter: { input: '$unfinishedIds', cond: { $ne: ['$$this', null] } },
            },
          },
        },
      ])
      .exec();
    return Object.fromEntries(
      rows.map((r) => [
        r._id,
        {
          scopeCount: r.scopeCount,
          scopePoints: r.scopePoints,
          completedCount: r.completedCount,
          completedPoints: r.completedPoints,
          unfinishedIds: r.unfinishedIds,
        },
      ]),
    );
  }

  async issuesForBurndown(
    tenantId: string,
    cycleId: string,
    extraIds: string[],
  ): Promise<BurndownIssueRow[]> {
    // Current members OR the completed cycle's swept-away ids (empty while open).
    const or: FilterQuery<IssueDoc>[] = [{ cycleId }];
    if (extraIds.length) or.push({ _id: { $in: extraIds } });
    const docs = await this.model
      .find(
        { tenantId, $or: or },
        {
          createdAt: 1,
          updatedAt: 1,
          status: 1,
          estimate: 1,
          assigneeId: 1,
          assigneeName: 1,
          labelKeys: 1,
          projectId: 1,
        },
      )
      .lean<
        Pick<
          IssueDoc,
          | 'createdAt'
          | 'updatedAt'
          | 'status'
          | 'estimate'
          | 'assigneeId'
          | 'assigneeName'
          | 'labelKeys'
          | 'projectId'
        >[]
      >()
      .exec();
    return docs.map((d) => ({
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      status: d.status,
      estimate: d.estimate ?? 0,
      assigneeId: d.assigneeId ?? '',
      assigneeName: d.assigneeName ?? '',
      labelKeys: d.labelKeys ?? [],
      projectId: d.projectId ?? '',
    }));
  }

  async moveUnfinishedIssues(
    tenantId: string,
    fromCycleIds: string[],
    toCycleId: string,
    completedStatusKeys: string[],
  ): Promise<number> {
    if (!fromCycleIds.length) return 0;
    // Rolling into a real next cycle bumps the carry counter (drives the
    // "Carried over ×N" badge). Dropping to no-cycle (rollover off) clears it —
    // a detached issue isn't "carried" anywhere.
    const update = toCycleId
      ? { $set: { cycleId: toCycleId }, $inc: { carryOverCount: 1 } }
      : { $set: { cycleId: toCycleId, carryOverCount: 0 } };
    const res = await this.model
      .updateMany(
        { tenantId, cycleId: { $in: fromCycleIds }, status: { $nin: completedStatusKeys } },
        update,
      )
      .exec();
    return res.modifiedCount ?? 0;
  }

  async clearCycleIds(tenantId: string, cycleIds: string[]): Promise<number> {
    if (!cycleIds.length) return 0;
    const res = await this.model
      .updateMany(
        { tenantId, cycleId: { $in: cycleIds } },
        { $set: { cycleId: '', carryOverCount: 0 } },
      )
      .exec();
    return res.modifiedCount ?? 0;
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
