import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { IPlatformAdminRepository } from '@application/platform/repositories/platform-admin.repository';
import { PlatformAdminEntity } from '@application/platform/domain/entities/platform-admin.entity';
import { PlatformAdminDoc } from '../entities/platform-admin.schema';

@Injectable()
export class PlatformAdminRepository
  extends BaseRepository<PlatformAdminEntity, PlatformAdminDoc>
  implements IPlatformAdminRepository
{
  constructor(@InjectModel('PlatformAdmin') model: Model<PlatformAdminDoc>) {
    super(model);
  }

  toDomain(doc: PlatformAdminDoc): PlatformAdminEntity {
    const result = PlatformAdminEntity.create(
      {
        email: doc.email,
        name: doc.name,
        passwordHash: doc.passwordHash,
        isActive: doc.isActive,
        lastLoginAt: doc.lastLoginAt ?? null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(admin: PlatformAdminEntity): Partial<PlatformAdminDoc> {
    return {
      _id: admin.id.toString(),
      email: admin.email,
      name: admin.name,
      passwordHash: admin.passwordHash,
      isActive: admin.isActive,
      lastLoginAt: admin.lastLoginAt,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    };
  }

  async findById(id: string): Promise<PlatformAdminEntity | null> {
    const doc = await this.model.findById(id).lean<PlatformAdminDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByEmail(email: string): Promise<PlatformAdminEntity | null> {
    const doc = await this.model
      .findOne({ email: email.trim().toLowerCase() })
      .lean<PlatformAdminDoc>()
      .exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findAll(): Promise<PlatformAdminEntity[]> {
    const docs = await this.model
      .find({})
      .sort({ createdAt: 1 })
      .lean<PlatformAdminDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async countAll(): Promise<number> {
    return this.model.countDocuments({}).exec();
  }

  async save(admin: PlatformAdminEntity): Promise<void> {
    const doc = this.toDocument(admin);
    await this.model
      .findByIdAndUpdate(doc._id, doc, { upsert: true, setDefaultsOnInsert: true, new: true })
      .exec();
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }
}
