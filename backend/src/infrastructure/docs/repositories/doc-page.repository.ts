import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { IDocPageRepository } from '@application/docs/repositories/doc-page.repository';
import { DocPageEntity } from '@application/docs/domain/entities/doc-page.entity';
import { DocPageDoc } from '../entities/doc-page.schema';

@Injectable()
export class DocPageRepository
  extends BaseRepository<DocPageEntity, DocPageDoc>
  implements IDocPageRepository
{
  constructor(@InjectModel('DocPage') model: Model<DocPageDoc>) {
    super(model);
  }

  toDomain(doc: DocPageDoc): DocPageEntity {
    const result = DocPageEntity.create(
      {
        tenantId: doc.tenantId,
        docId: doc.docId,
        parentId: doc.parentId ?? '',
        title: doc.title,
        icon: doc.icon ?? '',
        color: doc.color ?? null,
        coverUrl: doc.coverUrl ?? '',
        content: doc.content ?? '',
        links: doc.links ?? [],
        order: doc.order ?? 0,
        createdBy: doc.createdBy ?? '',
        updatedBy: doc.updatedBy ?? '',
        updatedByName: doc.updatedByName ?? '',
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(page: DocPageEntity): Partial<DocPageDoc> {
    return {
      _id: page.id.toString(),
      tenantId: page.tenantId,
      docId: page.docId,
      parentId: page.parentId,
      title: page.title,
      icon: page.icon,
      color: page.color,
      coverUrl: page.coverUrl,
      content: page.content,
      links: page.links,
      order: page.order,
      createdBy: page.createdBy,
      updatedBy: page.updatedBy,
      updatedByName: page.updatedByName,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    };
  }

  async findById(id: string): Promise<DocPageEntity | null> {
    const doc = await this.model.findById(id).lean<DocPageDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByDoc(docId: string): Promise<DocPageEntity[]> {
    const docs = await this.model
      .find({ docId })
      // `createdAt` breaks ties so two pages sharing an order never swap between
      // reads — the rail would appear to shuffle itself.
      .sort({ order: 1, createdAt: 1 })
      .lean<DocPageDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async findByLinkRef(tenantId: string, refId: string): Promise<DocPageEntity[]> {
    const docs = await this.model
      .find({ tenantId, 'links.refId': refId })
      .sort({ updatedAt: -1 })
      .lean<DocPageDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async countByDocIds(docIds: string[]): Promise<Record<string, number>> {
    if (!docIds.length) return {};
    const rows = await this.model
      .aggregate<{ _id: string; count: number }>([
        { $match: { docId: { $in: docIds } } },
        { $group: { _id: '$docId', count: { $sum: 1 } } },
      ])
      .exec();
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});
  }

  async save(page: DocPageEntity): Promise<void> {
    const payload = this.toDocument(page);
    await this.model
      .findByIdAndUpdate(payload._id, payload, {
        upsert: true,
        setDefaultsOnInsert: true,
        new: true,
      })
      .exec();
  }

  async update(page: DocPageEntity): Promise<void> {
    await this.save(page);
  }

  async updateMany(pages: DocPageEntity[]): Promise<void> {
    if (!pages.length) return;
    // One round trip for a whole drag — a reorder can touch every sibling.
    await this.model.bulkWrite(
      pages.map((page) => ({
        updateOne: {
          filter: { _id: page.id.toString() },
          update: { $set: this.toDocument(page) },
        },
      })),
    );
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.model.deleteMany({ _id: { $in: ids } }).exec();
  }

  async deleteByDoc(docId: string): Promise<void> {
    await this.model.deleteMany({ docId }).exec();
  }
}
