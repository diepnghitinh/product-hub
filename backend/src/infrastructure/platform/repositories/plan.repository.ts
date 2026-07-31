import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { IPlanRepository } from '@application/platform/repositories/plan.repository';
import { PlanEntity } from '@application/platform/domain/entities/plan.entity';
import { PlanDoc } from '../entities/plan.schema';

@Injectable()
export class PlanRepository
  extends BaseRepository<PlanEntity, PlanDoc>
  implements IPlanRepository
{
  constructor(@InjectModel('Plan') model: Model<PlanDoc>) {
    super(model);
  }

  toDomain(doc: PlanDoc): PlanEntity {
    const result = PlanEntity.create(
      {
        code: doc.code,
        name: doc.name,
        description: doc.description ?? null,
        priceMonthly: doc.priceMonthly,
        priceYearly: doc.priceYearly,
        currency: doc.currency,
        features: doc.features ?? {},
        extendsCode: doc.extendsCode ?? null,
        isActive: doc.isActive,
        sortOrder: doc.sortOrder,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(plan: PlanEntity): Partial<PlanDoc> {
    return {
      _id: plan.id.toString(),
      code: plan.code,
      name: plan.name,
      description: plan.description,
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly,
      currency: plan.currency,
      features: plan.features,
      extendsCode: plan.extendsCode,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  async findById(id: string): Promise<PlanEntity | null> {
    const doc = await this.model.findById(id).lean<PlanDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByCode(code: string): Promise<PlanEntity | null> {
    const doc = await this.model
      .findOne({ code: code.trim().toLowerCase() })
      .lean<PlanDoc>()
      .exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findAll(): Promise<PlanEntity[]> {
    const docs = await this.model
      .find({})
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean<PlanDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async existsByCode(code: string, excludeId?: string): Promise<boolean> {
    const filter: FilterQuery<PlanDoc> = { code: code.trim().toLowerCase() };
    if (excludeId) filter._id = { $ne: excludeId };
    const count = await this.model.countDocuments(filter).exec();
    return count > 0;
  }

  async findExtending(code: string): Promise<PlanEntity[]> {
    const docs = await this.model
      .find({ extendsCode: code.trim().toLowerCase() })
      .lean<PlanDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async save(plan: PlanEntity): Promise<void> {
    const doc = this.toDocument(plan);
    await this.model
      .findByIdAndUpdate(doc._id, doc, { upsert: true, setDefaultsOnInsert: true, new: true })
      .exec();
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }
}
