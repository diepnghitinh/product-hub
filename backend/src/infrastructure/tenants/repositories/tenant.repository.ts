import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { ITenantRepository } from '@application/tenants/repositories/tenant.repository';
import { TenantEntity } from '@application/tenants/domain/entities/tenant.entity';
import { TenantDoc } from '../entities/tenant.schema';

@Injectable()
export class TenantRepository
  extends BaseRepository<TenantEntity, TenantDoc>
  implements ITenantRepository
{
  constructor(@InjectModel('Tenant') model: Model<TenantDoc>) {
    super(model);
  }

  toDomain(doc: TenantDoc): TenantEntity {
    const result = TenantEntity.create(
      { name: doc.name, createdAt: doc.createdAt, updatedAt: doc.updatedAt },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(domain: TenantEntity): Partial<TenantDoc> {
    return {
      _id: domain.id.toString(),
      name: domain.name,
      createdAt: domain.createdAt,
      updatedAt: domain.updatedAt,
    };
  }

  async findById(id: string): Promise<TenantEntity | null> {
    const doc = await this.model.findById(id).lean<TenantDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async save(tenant: TenantEntity): Promise<void> {
    const doc = this.toDocument(tenant);
    await this.model
      .findByIdAndUpdate(doc._id, doc, { upsert: true, setDefaultsOnInsert: true, new: true })
      .exec();
  }
}
