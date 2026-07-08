import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { IApiKeyRepository } from '@application/api-keys/repositories/api-key.repository';
import { ApiKeyEntity } from '@application/api-keys/domain/api-key.entity';
import { ApiKeyDoc } from '../entities/api-key.schema';

@Injectable()
export class ApiKeyRepository
  extends BaseRepository<ApiKeyEntity, ApiKeyDoc>
  implements IApiKeyRepository
{
  constructor(@InjectModel('ApiKey') model: Model<ApiKeyDoc>) {
    super(model);
  }

  toDomain(doc: ApiKeyDoc): ApiKeyEntity {
    const result = ApiKeyEntity.create(
      {
        tenantId: doc.tenantId,
        name: doc.name,
        keyHash: doc.keyHash,
        prefix: doc.prefix,
        createdBy: doc.createdBy,
        lastUsedAt: doc.lastUsedAt,
        createdAt: doc.createdAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(key: ApiKeyEntity): Partial<ApiKeyDoc> {
    return {
      _id: key.id.toString(),
      tenantId: key.tenantId,
      name: key.name,
      keyHash: key.keyHash,
      prefix: key.prefix,
      createdBy: key.createdBy,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
    };
  }

  async findById(id: string): Promise<ApiKeyEntity | null> {
    const doc = await this.model.findById(id).lean<ApiKeyDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByHash(keyHash: string): Promise<ApiKeyEntity | null> {
    const doc = await this.model.findOne({ keyHash }).lean<ApiKeyDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByTenant(tenantId: string): Promise<ApiKeyEntity[]> {
    const docs = await this.model
      .find({ tenantId })
      .sort({ createdAt: -1 })
      .lean<ApiKeyDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async save(key: ApiKeyEntity): Promise<void> {
    const doc = this.toDocument(key);
    await this.model
      .findByIdAndUpdate(doc._id, doc, { upsert: true, setDefaultsOnInsert: true, new: true })
      .exec();
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }
}
