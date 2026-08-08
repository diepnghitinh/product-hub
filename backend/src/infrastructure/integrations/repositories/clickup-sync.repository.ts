import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ClickUpSyncScope } from '@application/app-settings/domain/clickup.types';
import {
  ClickUpSyncBinding,
  IClickUpSyncRepository,
  SaveClickUpSyncData,
} from '@application/integrations/repositories/clickup-sync.repository';
import { ClickUpSyncDoc } from '../entities/clickup-sync.schema';

@Injectable()
export class ClickUpSyncRepository implements IClickUpSyncRepository {
  constructor(@InjectModel('ClickUpSync') private readonly model: Model<ClickUpSyncDoc>) {}

  private toRecord(d: ClickUpSyncDoc): ClickUpSyncBinding {
    return {
      id: d._id,
      tenantId: d.tenantId,
      scope: d.scope as ClickUpSyncScope,
      scopeId: d.scopeId,
      listId: d.listId ?? '',
      listName: d.listName ?? '',
      spaceId: d.spaceId ?? '',
      spaceName: d.spaceName ?? '',
      enabled: d.enabled ?? false,
      statusMap: (d.statusMap ?? []).map((p) => ({
        key: p.key,
        clickupStatus: p.clickupStatus ?? '',
      })),
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }

  async findForScope(
    tenantId: string,
    scope: ClickUpSyncScope,
    scopeId: string,
  ): Promise<ClickUpSyncBinding | null> {
    if (!scopeId) return null;
    const doc = await this.model
      .findOne({ tenantId, scope, scopeId })
      .lean<ClickUpSyncDoc>()
      .exec();
    return doc ? this.toRecord(doc) : null;
  }

  async findAllForTenant(tenantId: string): Promise<ClickUpSyncBinding[]> {
    const docs = await this.model
      .find({ tenantId })
      .sort({ createdAt: 1 })
      .lean<ClickUpSyncDoc[]>()
      .exec();
    return docs.map((d) => this.toRecord(d));
  }

  async save(data: SaveClickUpSyncData): Promise<ClickUpSyncBinding> {
    const { tenantId, scope, scopeId, ...rest } = data;
    // Upsert on the board: re-saving the mapping form is an edit of the one
    // binding that board has, never a second one.
    const doc = await this.model
      .findOneAndUpdate(
        { tenantId, scope, scopeId },
        { $set: rest, $setOnInsert: { tenantId, scope, scopeId } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean<ClickUpSyncDoc>()
      .exec();
    return this.toRecord(doc);
  }

  async removeForScope(
    tenantId: string,
    scope: ClickUpSyncScope,
    scopeId: string,
  ): Promise<boolean> {
    const res = await this.model.deleteOne({ tenantId, scope, scopeId }).exec();
    return (res.deletedCount ?? 0) > 0;
  }

  async removeAllForTenant(tenantId: string): Promise<number> {
    const res = await this.model.deleteMany({ tenantId }).exec();
    return res.deletedCount ?? 0;
  }
}
