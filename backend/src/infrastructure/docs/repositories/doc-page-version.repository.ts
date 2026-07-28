import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { IDocPageVersionRepository } from '@application/docs/repositories/doc-page-version.repository';
import { DocPageVersionEntity } from '@application/docs/domain/entities/doc-page-version.entity';
import { DocPageVersionDoc } from '../entities/doc-page-version.schema';

@Injectable()
export class DocPageVersionRepository
  extends BaseRepository<DocPageVersionEntity, DocPageVersionDoc>
  implements IDocPageVersionRepository
{
  constructor(@InjectModel('DocPageVersion') model: Model<DocPageVersionDoc>) {
    super(model);
  }

  toDomain(doc: DocPageVersionDoc): DocPageVersionEntity {
    const result = DocPageVersionEntity.create(
      {
        tenantId: doc.tenantId,
        docId: doc.docId,
        pageId: doc.pageId,
        title: doc.title ?? '',
        content: doc.content ?? '',
        label: doc.label ?? '',
        createdBy: doc.createdBy ?? '',
        createdByName: doc.createdByName ?? '',
        createdAt: doc.createdAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(version: DocPageVersionEntity): Partial<DocPageVersionDoc> {
    return {
      _id: version.id.toString(),
      tenantId: version.tenantId,
      docId: version.docId,
      pageId: version.pageId,
      title: version.title,
      content: version.content,
      label: version.label,
      createdBy: version.createdBy,
      createdByName: version.createdByName,
      createdAt: version.createdAt,
    };
  }

  async findById(id: string): Promise<DocPageVersionEntity | null> {
    const doc = await this.model.findById(id).lean<DocPageVersionDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByPage(pageId: string): Promise<DocPageVersionEntity[]> {
    const docs = await this.model
      .find({ pageId })
      .sort({ createdAt: -1 })
      .lean<DocPageVersionDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async save(version: DocPageVersionEntity): Promise<void> {
    // A plain insert: versions are append-only, so there is nothing to upsert over.
    await this.model.create(this.toDocument(version));
  }

  async deleteByPages(pageIds: string[]): Promise<void> {
    if (!pageIds.length) return;
    await this.model.deleteMany({ pageId: { $in: pageIds } }).exec();
  }

  async deleteByDoc(docId: string): Promise<void> {
    await this.model.deleteMany({ docId }).exec();
  }
}
