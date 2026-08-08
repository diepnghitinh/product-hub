import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ClickUpLinkOrigin,
  ClickUpLinkTarget,
  ClickUpStatusType,
} from '@application/app-settings/domain/clickup.types';
import {
  ClickUpLinkRecord,
  ClickUpTaskSnapshot,
  CreateClickUpLinkData,
  IClickUpLinkRepository,
} from '@application/integrations/repositories/clickup-link.repository';
import { ClickUpLinkDoc } from '../entities/clickup-link.schema';

@Injectable()
export class ClickUpLinkRepository implements IClickUpLinkRepository {
  constructor(@InjectModel('ClickUpLink') private readonly model: Model<ClickUpLinkDoc>) {}

  private toRecord(d: ClickUpLinkDoc): ClickUpLinkRecord {
    return {
      id: d._id,
      tenantId: d.tenantId,
      clickupTaskId: d.clickupTaskId,
      targetType: d.targetType as ClickUpLinkTarget,
      targetId: d.targetId,
      roadmapId: d.roadmapId ?? '',
      origin: (d.origin as ClickUpLinkOrigin) ?? ClickUpLinkOrigin.MANUAL,
      pushedStatus: d.pushedStatus ?? '',
      taskName: d.taskName ?? '',
      taskUrl: d.taskUrl ?? '',
      customId: d.customId ?? '',
      status: d.status ?? '',
      statusColor: d.statusColor ?? '',
      statusType: (d.statusType ?? '') as ClickUpStatusType,
      assignees: d.assignees ?? [],
      priority: d.priority ?? '',
      dueDate: d.dueDate ?? '',
      listName: d.listName ?? '',
      spaceName: d.spaceName ?? '',
      unavailableReason: d.unavailableReason ?? '',
      createdBy: d.createdBy ?? '',
      createdByName: d.createdByName ?? '',
      createdAt: d.createdAt,
      lastSyncedAt: d.lastSyncedAt ?? d.createdAt,
    };
  }

  async findForTarget(
    tenantId: string,
    targetType: ClickUpLinkTarget,
    targetId: string,
  ): Promise<ClickUpLinkRecord[]> {
    const docs = await this.model
      .find({ tenantId, targetType, targetId })
      .sort({ createdAt: 1 })
      .lean<ClickUpLinkDoc[]>()
      .exec();
    return docs.map((d) => this.toRecord(d));
  }

  async findForTargets(
    tenantId: string,
    targetType: ClickUpLinkTarget,
    targetIds: string[],
  ): Promise<ClickUpLinkRecord[]> {
    // `$in: []` matches nothing, but the round trip is still pointless.
    if (!targetIds.length) return [];
    const docs = await this.model
      .find({ tenantId, targetType, targetId: { $in: targetIds } })
      .sort({ createdAt: 1 })
      .lean<ClickUpLinkDoc[]>()
      .exec();
    return docs.map((d) => this.toRecord(d));
  }

  async findByTaskId(tenantId: string, clickupTaskId: string): Promise<ClickUpLinkRecord[]> {
    // Never let a blank id fan out to every row — this is reached from the
    // unauthenticated webhook path, where the task id comes off the payload.
    if (!clickupTaskId) return [];
    const docs = await this.model.find({ tenantId, clickupTaskId }).lean<ClickUpLinkDoc[]>().exec();
    return docs.map((d) => this.toRecord(d));
  }

  async findById(tenantId: string, id: string): Promise<ClickUpLinkRecord | null> {
    const doc = await this.model.findOne({ _id: id, tenantId }).lean<ClickUpLinkDoc>().exec();
    return doc ? this.toRecord(doc) : null;
  }

  async create(data: CreateClickUpLinkData): Promise<ClickUpLinkRecord> {
    const {
      tenantId,
      targetType,
      targetId,
      clickupTaskId,
      createdBy,
      createdByName,
      origin,
      ...rest
    } = data;
    // Upsert on the unique key: re-pasting the same task URL onto the same record
    // is "refresh this link", not an error and not a second row. `createdBy` is
    // `$setOnInsert` so a colleague's refresh doesn't rewrite who linked it.
    //
    // `origin` is insert-only for a sharper reason: it decides whether we may
    // write to this ClickUp task, so no later call may change it. Pasting the URL
    // of a synced task can't demote the link, and — the direction that matters —
    // nothing can promote a hand-pasted link into one we start overwriting.
    const doc = await this.model
      .findOneAndUpdate(
        { tenantId, targetType, targetId, clickupTaskId },
        {
          $set: { ...rest, lastSyncedAt: new Date() },
          $setOnInsert: {
            tenantId,
            targetType,
            targetId,
            clickupTaskId,
            createdBy,
            createdByName,
            origin: origin ?? ClickUpLinkOrigin.MANUAL,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean<ClickUpLinkDoc>()
      .exec();
    return this.toRecord(doc);
  }

  async markPushed(tenantId: string, id: string, pushedStatus: string): Promise<void> {
    await this.model.updateOne({ _id: id, tenantId }, { $set: { pushedStatus } }).exec();
  }

  async updateSnapshot(
    tenantId: string,
    clickupTaskId: string,
    snapshot: ClickUpTaskSnapshot,
  ): Promise<number> {
    if (!clickupTaskId) return 0;
    const res = await this.model
      .updateMany({ tenantId, clickupTaskId }, { $set: { ...snapshot, lastSyncedAt: new Date() } })
      .exec();
    return res.modifiedCount ?? 0;
  }

  async removeById(tenantId: string, id: string): Promise<boolean> {
    const res = await this.model.deleteOne({ _id: id, tenantId }).exec();
    return (res.deletedCount ?? 0) > 0;
  }

  async removeAllForTenant(tenantId: string): Promise<number> {
    const res = await this.model.deleteMany({ tenantId }).exec();
    return res.deletedCount ?? 0;
  }
}
