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
        authorId: doc.authorId,
        authorName: doc.authorName,
        body: doc.body,
        mentions: doc.mentions,
        images: doc.images,
        createdAt: doc.createdAt,
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
      authorId: comment.authorId,
      authorName: comment.authorName,
      body: comment.body,
      mentions: comment.mentions,
      images: comment.images,
      createdAt: comment.createdAt,
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

  async findMentionsForUser(
    tenantId: string,
    userId: string,
    limit: number,
  ): Promise<CommentEntity[]> {
    const docs = await this.model
      .find({ tenantId, mentions: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<CommentDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async append(comment: CommentEntity): Promise<void> {
    await this.model.create(this.toDocument(comment));
  }
}
