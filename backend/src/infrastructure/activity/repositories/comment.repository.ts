import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { ICommentRepository } from '@application/activity/repositories/comment.repository';
import { CommentEntity } from '@application/activity/domain/entities/comment.entity';
import { CommentDoc } from '../entities/comment.schema';

@Injectable()
export class CommentRepository
  extends BaseRepository<CommentEntity, CommentDoc>
  implements ICommentRepository
{
  constructor(@InjectModel('Comment') model: Model<CommentDoc>) {
    super(model);
  }

  toDomain(doc: CommentDoc): CommentEntity {
    const result = CommentEntity.create(
      {
        tenantId: doc.tenantId,
        bugId: doc.bugId,
        taskId: doc.taskId,
        roadmapItemId: doc.roadmapItemId,
        authorId: doc.authorId,
        authorName: doc.authorName,
        body: doc.body,
        mentions: doc.mentions,
        images: doc.images,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(comment: CommentEntity): Partial<CommentDoc> {
    return {
      _id: comment.id.toString(),
      tenantId: comment.tenantId,
      bugId: comment.bugId,
      taskId: comment.taskId,
      roadmapItemId: comment.roadmapItemId,
      authorId: comment.authorId,
      authorName: comment.authorName,
      body: comment.body,
      mentions: comment.mentions,
      images: comment.images,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }

  async findByBug(tenantId: string, bugId: string): Promise<CommentEntity[]> {
    const docs = await this.model
      .find({ tenantId, bugId })
      .sort({ createdAt: 1 })
      .lean<CommentDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async findByTask(tenantId: string, taskId: string): Promise<CommentEntity[]> {
    const docs = await this.model
      .find({ tenantId, taskId })
      .sort({ createdAt: 1 })
      .lean<CommentDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async findByRoadmapItem(tenantId: string, roadmapItemId: string): Promise<CommentEntity[]> {
    const docs = await this.model
      .find({ tenantId, roadmapItemId })
      .sort({ createdAt: 1 })
      .lean<CommentDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async findById(tenantId: string, id: string): Promise<CommentEntity | null> {
    const doc = await this.model.findOne({ _id: id, tenantId }).lean<CommentDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findMentionsForUser(
    tenantId: string,
    userId: string,
    limit: number,
  ): Promise<CommentEntity[]> {
    // Bug comments only — the inbox links mentions to /bugs/. Task-comment
    // mentions are out of scope for the inbox in v1.
    const docs = await this.model
      .find({ tenantId, mentions: userId, bugId: { $ne: '' } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<CommentDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async append(comment: CommentEntity): Promise<void> {
    await this.model.create(this.toDocument(comment));
  }

  async update(comment: CommentEntity): Promise<void> {
    await this.model
      .findByIdAndUpdate(comment.id.toString(), this.toDocument(comment), { new: true })
      .exec();
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }
}
