import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import {
  DocPageCommentCount,
  ICommentRepository,
} from '@application/activity/repositories/comment.repository';
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
        issueId: doc.issueId,
        bugId: doc.bugId,
        taskId: doc.taskId,
        roadmapItemId: doc.roadmapItemId,
        docId: doc.docId,
        docPageId: doc.docPageId,
        anchorExact: doc.anchorExact,
        anchorPrefix: doc.anchorPrefix,
        anchorSuffix: doc.anchorSuffix,
        anchorStart: doc.anchorStart,
        resolved: doc.resolved,
        resolvedById: doc.resolvedById,
        resolvedByName: doc.resolvedByName,
        resolvedAt: doc.resolvedAt,
        parentId: doc.parentId,
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
      issueId: comment.issueId,
      bugId: comment.bugId,
      taskId: comment.taskId,
      roadmapItemId: comment.roadmapItemId,
      docId: comment.docId,
      docPageId: comment.docPageId,
      anchorExact: comment.anchorExact,
      anchorPrefix: comment.anchorPrefix,
      anchorSuffix: comment.anchorSuffix,
      anchorStart: comment.anchorStart,
      resolved: comment.resolved,
      resolvedById: comment.resolvedById,
      resolvedByName: comment.resolvedByName,
      resolvedAt: comment.resolvedAt,
      parentId: comment.parentId,
      authorId: comment.authorId,
      authorName: comment.authorName,
      body: comment.body,
      mentions: comment.mentions,
      images: comment.images,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }

  async findByIssue(tenantId: string, issueId: string): Promise<CommentEntity[]> {
    const docs = await this.model
      .find({ tenantId, issueId })
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

  async findByDocPage(tenantId: string, docPageId: string): Promise<CommentEntity[]> {
    const docs = await this.model
      .find({ tenantId, docPageId })
      .sort({ createdAt: 1 })
      .lean<CommentDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  /**
   * Open threads per page across one doc, for the rail's badges. Counts *roots*
   * (`parentId: ''`) — a thread is one conversation however many replies it has,
   * so "3" means three things to look at, not three messages.
   */
  async countOpenByDoc(tenantId: string, docId: string): Promise<DocPageCommentCount[]> {
    const rows = await this.model
      .aggregate<{ _id: string; openCount: number }>([
        { $match: { tenantId, docId, parentId: '', resolved: false } },
        { $group: { _id: '$docPageId', openCount: { $sum: 1 } } },
      ])
      .exec();
    return rows.map((r) => ({ pageId: r._id, openCount: r.openCount }));
  }

  async deleteByDocPages(tenantId: string, docPageIds: string[]): Promise<void> {
    if (!docPageIds.length) return;
    await this.model.deleteMany({ tenantId, docPageId: { $in: docPageIds } }).exec();
  }

  async deleteByDoc(tenantId: string, docId: string): Promise<void> {
    await this.model.deleteMany({ tenantId, docId }).exec();
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
    // Bug and doc-page comments — the two the inbox knows how to open. Task and
    // roadmap-item mentions stay out of scope, so filter rather than take all.
    const docs = await this.model
      .find({
        tenantId,
        mentions: userId,
        $or: [{ bugId: { $ne: '' } }, { docPageId: { $ne: '' } }],
      })
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
