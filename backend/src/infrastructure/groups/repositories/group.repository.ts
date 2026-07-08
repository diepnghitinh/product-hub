import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { IGroupRepository } from '@application/groups/repositories/group.repository';
import { GroupEntity } from '@application/groups/domain/entities/group.entity';
import { GroupDoc } from '../entities/group.schema';

@Injectable()
export class GroupRepository
  extends BaseRepository<GroupEntity, GroupDoc>
  implements IGroupRepository
{
  constructor(@InjectModel('Group') model: Model<GroupDoc>) {
    super(model);
  }

  toDomain(doc: GroupDoc): GroupEntity {
    const result = GroupEntity.create(
      {
        tenantId: doc.tenantId,
        projectId: doc.projectId,
        slug: doc.slug,
        title: doc.title,
        order: doc.order,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(group: GroupEntity): Partial<GroupDoc> {
    return {
      _id: group.id.toString(),
      tenantId: group.tenantId,
      projectId: group.projectId,
      slug: group.slug,
      title: group.title,
      order: group.order,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  async findById(id: string): Promise<GroupEntity | null> {
    const doc = await this.model.findById(id).lean<GroupDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByProject(tenantId: string, projectId: string): Promise<GroupEntity[]> {
    const docs = await this.model
      .find({ tenantId, projectId })
      .sort({ order: 1, createdAt: 1 })
      .lean<GroupDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async existsBySlug(
    tenantId: string,
    projectId: string,
    slug: string,
  ): Promise<boolean> {
    const count = await this.model
      .countDocuments({ tenantId, projectId, slug })
      .exec();
    return count > 0;
  }

  async countByProject(tenantId: string, projectId: string): Promise<number> {
    return this.model.countDocuments({ tenantId, projectId }).exec();
  }

  async save(group: GroupEntity): Promise<void> {
    const doc = this.toDocument(group);
    await this.model
      .findByIdAndUpdate(doc._id, doc, { upsert: true, setDefaultsOnInsert: true, new: true })
      .exec();
  }

  async update(group: GroupEntity): Promise<void> {
    await this.save(group);
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }
}
