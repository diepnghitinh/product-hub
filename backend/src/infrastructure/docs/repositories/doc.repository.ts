import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { DocViewer, IDocRepository } from '@application/docs/repositories/doc.repository';
import { DocEntity } from '@application/docs/domain/entities/doc.entity';
import { DocDoc } from '../entities/doc.schema';

@Injectable()
export class DocRepository
  extends BaseRepository<DocEntity, DocDoc>
  implements IDocRepository
{
  constructor(@InjectModel('Doc') model: Model<DocDoc>) {
    super(model);
  }

  toDomain(doc: DocDoc): DocEntity {
    const result = DocEntity.create(
      {
        tenantId: doc.tenantId,
        ref: doc.ref ?? '',
        title: doc.title,
        icon: doc.icon ?? '',
        color: doc.color ?? null,
        coverUrl: doc.coverUrl ?? '',
        tags: doc.tags ?? [],
        createdBy: doc.createdBy ?? '',
        createdByName: doc.createdByName ?? '',
        isPrivate: doc.isPrivate ?? false,
        publicEnabled: doc.publicEnabled ?? false,
        publicToken: doc.publicToken ?? null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(doc: DocEntity): Partial<DocDoc> {
    return {
      _id: doc.id.toString(),
      tenantId: doc.tenantId,
      ref: doc.ref,
      title: doc.title,
      icon: doc.icon,
      color: doc.color,
      coverUrl: doc.coverUrl,
      tags: doc.tags,
      createdBy: doc.createdBy,
      createdByName: doc.createdByName,
      isPrivate: doc.isPrivate,
      publicEnabled: doc.publicEnabled,
      publicToken: doc.publicToken,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findById(id: string): Promise<DocEntity | null> {
    const doc = await this.model.findById(id).lean<DocDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  /**
   * A ref is uppercase and hyphenated (`DOC-6HCUHKX`), a uuid is neither, so the
   * shape tells them apart — no need to try both queries. Refs are matched
   * case-insensitively: they get typed by hand and pasted out of chat.
   */
  async findByIdOrRef(tenantId: string, idOrRef: string): Promise<DocEntity | null> {
    const key = (idOrRef ?? '').trim();
    if (!key) return null;
    const isRef = /^[A-Za-z]+-[A-Za-z0-9]+$/.test(key) && key.length < 36;
    const doc = await this.model
      .findOne(isRef ? { tenantId, ref: key.toUpperCase() } : { _id: key, tenantId })
      .lean<DocDoc>()
      .exec();
    return doc ? this.toDomain(doc) : null;
  }

  async refExists(tenantId: string, ref: string): Promise<boolean> {
    return (await this.model.countDocuments({ tenantId, ref }).exec()) > 0;
  }

  /**
   * `isPrivate` is in the query as a second lock, not because the first one is
   * doubtful: going private already calls `disableSharing`, so a private doc has
   * no live token to match. But this is the one route with no signed-in user
   * behind it, and a stray token left enabled by some future write path would go
   * straight to the open internet. `$ne: true` so pre-flag docs still resolve.
   */
  async findByPublicToken(token: string): Promise<DocEntity | null> {
    const doc = await this.model
      .findOne({ publicToken: token, publicEnabled: true, isPrivate: { $ne: true } })
      .lean<DocDoc>()
      .exec();
    return doc ? this.toDomain(doc) : null;
  }

  /**
   * The privacy boundary for the *list*. Single-doc reads re-check with
   * `DocEntity.isVisibleTo`; here it has to be a query clause, because the whole
   * point of this call is to return docs the caller never named.
   *
   * `isPrivate: { $ne: true }` rather than `false` — docs written before the flag
   * existed have no such field at all, and `{ isPrivate: false }` would silently
   * drop every one of them.
   */
  async findByTenant(tenantId: string, viewer: DocViewer | null): Promise<DocEntity[]> {
    const filter: FilterQuery<DocDoc> = { tenantId };
    if (viewer && !viewer.isAdmin) {
      filter.$or = [{ isPrivate: { $ne: true } }, { createdBy: viewer.userId }];
    }
    const docs = await this.model.find(filter).sort({ updatedAt: -1 }).lean<DocDoc[]>().exec();
    return docs.map((d) => this.toDomain(d));
  }

  async save(doc: DocEntity): Promise<void> {
    const payload = this.toDocument(doc);
    await this.model
      .findByIdAndUpdate(payload._id, payload, {
        upsert: true,
        setDefaultsOnInsert: true,
        new: true,
      })
      .exec();
  }

  async update(doc: DocEntity): Promise<void> {
    await this.save(doc);
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }
}
