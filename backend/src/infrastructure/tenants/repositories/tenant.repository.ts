import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import {
  ITenantRepository,
  TenantListQuery,
  TenantPage,
} from '@application/tenants/repositories/tenant.repository';
import { TenantEntity } from '@application/tenants/domain/entities/tenant.entity';
import { TenantStatus } from '@application/tenants/domain/entities/tenant.props';
import { TenantDoc } from '../entities/tenant.schema';

/** Escape a user-typed search term so it can't act as a regex. */
const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
      {
        name: doc.name,
        slug: doc.slug ?? null,
        status: (doc.status as TenantStatus) ?? TenantStatus.ACTIVE,
        contactEmail: doc.contactEmail ?? null,
        notes: doc.notes ?? null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(domain: TenantEntity): Partial<TenantDoc> {
    return {
      _id: domain.id.toString(),
      name: domain.name,
      slug: domain.slug,
      status: domain.status,
      contactEmail: domain.contactEmail,
      notes: domain.notes,
      createdAt: domain.createdAt,
      updatedAt: domain.updatedAt,
    };
  }

  async allIds(): Promise<string[]> {
    const docs = await this.model.find({}, { _id: 1 }).lean<{ _id: string }[]>().exec();
    return docs.map((d) => d._id);
  }

  async findById(id: string): Promise<TenantEntity | null> {
    const doc = await this.model.findById(id).lean<TenantDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findManyByIds(ids: string[]): Promise<TenantEntity[]> {
    if (ids.length === 0) return [];
    const docs = await this.model
      .find({ _id: { $in: ids } })
      .lean<TenantDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async findAll(query: TenantListQuery): Promise<TenantPage> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));

    const filter: FilterQuery<TenantDoc> = {};
    if (query.status) {
      // Legacy rows have no `status` field at all, so "active" must also match
      // documents where it is missing.
      filter.status =
        query.status === TenantStatus.ACTIVE
          ? ({ $in: [TenantStatus.ACTIVE, null] } as FilterQuery<TenantDoc>['status'])
          : query.status;
    }
    if (query.search?.trim()) {
      const rx = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter.$or = [{ name: rx }, { slug: rx }, { contactEmail: rx }];
    }

    const [docs, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<TenantDoc[]>()
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

  async existsBySlug(slug: string, excludeId?: string): Promise<boolean> {
    const filter: FilterQuery<TenantDoc> = { slug };
    if (excludeId) filter._id = { $ne: excludeId };
    const count = await this.model.countDocuments(filter).exec();
    return count > 0;
  }

  async countAll(): Promise<number> {
    return this.model.countDocuments({}).exec();
  }

  async save(tenant: TenantEntity): Promise<void> {
    const doc = this.toDocument(tenant);
    await this.model
      .findByIdAndUpdate(doc._id, doc, { upsert: true, setDefaultsOnInsert: true, new: true })
      .exec();
  }
}
