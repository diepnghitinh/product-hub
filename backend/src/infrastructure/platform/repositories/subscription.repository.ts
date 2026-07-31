import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { ISubscriptionRepository } from '@application/platform/repositories/subscription.repository';
import { SubscriptionEntity } from '@application/platform/domain/entities/subscription.entity';
import {
  BillingCycle,
  SubscriptionStatus,
} from '@application/platform/domain/entities/subscription.props';
import { SubscriptionDoc } from '../entities/subscription.schema';

@Injectable()
export class SubscriptionRepository
  extends BaseRepository<SubscriptionEntity, SubscriptionDoc>
  implements ISubscriptionRepository
{
  constructor(@InjectModel('Subscription') model: Model<SubscriptionDoc>) {
    super(model);
  }

  toDomain(doc: SubscriptionDoc): SubscriptionEntity {
    const result = SubscriptionEntity.create(
      {
        tenantId: doc.tenantId,
        planCode: doc.planCode,
        status: doc.status as SubscriptionStatus,
        billingCycle: doc.billingCycle as BillingCycle,
        currentPeriodEnd: doc.currentPeriodEnd ?? null,
        cancelAt: doc.cancelAt ?? null,
        featureOverrides: doc.featureOverrides ?? {},
        notes: doc.notes ?? null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(sub: SubscriptionEntity): Partial<SubscriptionDoc> {
    return {
      _id: sub.id.toString(),
      tenantId: sub.tenantId,
      planCode: sub.planCode,
      status: sub.status,
      billingCycle: sub.billingCycle,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAt: sub.cancelAt,
      featureOverrides: sub.featureOverrides,
      notes: sub.notes,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    };
  }

  async findByTenant(tenantId: string): Promise<SubscriptionEntity | null> {
    const doc = await this.model.findOne({ tenantId }).lean<SubscriptionDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findManyByTenants(tenantIds: string[]): Promise<SubscriptionEntity[]> {
    if (tenantIds.length === 0) return [];
    const docs = await this.model
      .find({ tenantId: { $in: tenantIds } })
      .lean<SubscriptionDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async findAll(): Promise<SubscriptionEntity[]> {
    const docs = await this.model.find({}).lean<SubscriptionDoc[]>().exec();
    return docs.map((d) => this.toDomain(d));
  }

  async countByPlan(planCode: string): Promise<number> {
    return this.model.countDocuments({ planCode: planCode.trim().toLowerCase() }).exec();
  }

  async save(sub: SubscriptionEntity): Promise<void> {
    const doc = this.toDocument(sub);
    // Upsert on tenantId, not _id: a tenant has exactly one subscription, and
    // callers that build a fresh entity for an existing tenant must land on the
    // same row rather than trip the unique index.
    await this.model
      .findOneAndUpdate({ tenantId: sub.tenantId }, doc, {
        upsert: true,
        setDefaultsOnInsert: true,
        new: true,
      })
      .exec();
  }

  async deleteByTenant(tenantId: string): Promise<void> {
    await this.model.findOneAndDelete({ tenantId }).exec();
  }
}
