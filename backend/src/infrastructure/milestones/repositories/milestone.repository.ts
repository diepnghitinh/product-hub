import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { IMilestoneRepository } from '@application/milestones/repositories/milestone.repository';
import { MilestoneEntity } from '@application/milestones/domain/milestone.entity';
import { MilestoneStatus } from '@application/milestones/domain/milestone.types';
import { MilestoneDoc } from '../entities/milestone.schema';

@Injectable()
export class MilestoneRepository
  extends BaseRepository<MilestoneEntity, MilestoneDoc>
  implements IMilestoneRepository
{
  constructor(@InjectModel('Milestone') model: Model<MilestoneDoc>) {
    super(model);
  }

  toDomain(doc: MilestoneDoc): MilestoneEntity {
    const result = MilestoneEntity.create(
      {
        tenantId: doc.tenantId,
        title: doc.title,
        timeframe: doc.timeframe,
        status: doc.status as MilestoneStatus,
        objectives: doc.objectives ?? [],
        roadmapIds: doc.roadmapIds ?? [],
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(m: MilestoneEntity): Partial<MilestoneDoc> {
    return {
      _id: m.id.toString(),
      tenantId: m.tenantId,
      title: m.title,
      timeframe: m.timeframe,
      status: m.status,
      objectives: m.objectives,
      roadmapIds: m.roadmapIds,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }

  async findById(id: string): Promise<MilestoneEntity | null> {
    const doc = await this.model.findById(id).lean<MilestoneDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByTenant(tenantId: string): Promise<MilestoneEntity[]> {
    const docs = await this.model
      .find({ tenantId })
      .sort({ updatedAt: -1 })
      .lean<MilestoneDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async save(m: MilestoneEntity): Promise<void> {
    const doc = this.toDocument(m);
    await this.model
      .findByIdAndUpdate(doc._id, doc, { upsert: true, setDefaultsOnInsert: true, new: true })
      .exec();
  }

  async update(m: MilestoneEntity): Promise<void> {
    await this.save(m);
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }
}
