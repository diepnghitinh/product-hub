import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CreateIssueLinkData,
  IIssueLinkRepository,
  IssueLinkRecord,
} from '@application/issue-links/repositories/issue-link.repository';
import { IssueKind, RelationType } from '@application/issue-links/domain/relation-type.enum';
import { IssueLinkDoc } from '../entities/issue-link.schema';

@Injectable()
export class IssueLinkRepository implements IIssueLinkRepository {
  constructor(@InjectModel('IssueLink') private readonly model: Model<IssueLinkDoc>) {}

  private toRecord(d: IssueLinkDoc): IssueLinkRecord {
    return {
      id: d._id,
      tenantId: d.tenantId,
      issueType: d.issueType as IssueKind,
      sourceId: d.sourceId,
      targetId: d.targetId,
      relationType: d.relationType as RelationType,
      createdBy: d.createdBy,
      createdAt: d.createdAt,
    };
  }

  async findForIssue(
    tenantId: string,
    issueType: IssueKind,
    issueId: string,
  ): Promise<IssueLinkRecord[]> {
    const docs = await this.model
      .find({ tenantId, issueType, $or: [{ sourceId: issueId }, { targetId: issueId }] })
      .sort({ createdAt: 1 })
      .lean<IssueLinkDoc[]>()
      .exec();
    return docs.map((d) => this.toRecord(d));
  }

  async create(data: CreateIssueLinkData): Promise<IssueLinkRecord> {
    try {
      const doc = await this.model.create({ ...data });
      return this.toRecord(doc.toObject() as IssueLinkDoc);
    } catch (e: unknown) {
      // A repeat link trips the unique index — return the existing one instead.
      if ((e as { code?: number })?.code === 11000) {
        const existing = await this.model
          .findOne({
            tenantId: data.tenantId,
            issueType: data.issueType,
            sourceId: data.sourceId,
            targetId: data.targetId,
            relationType: data.relationType,
          })
          .lean<IssueLinkDoc>()
          .exec();
        if (existing) return this.toRecord(existing);
      }
      throw e;
    }
  }

  async removeById(tenantId: string, id: string): Promise<boolean> {
    const res = await this.model.deleteOne({ _id: id, tenantId }).exec();
    return (res.deletedCount ?? 0) > 0;
  }
}
