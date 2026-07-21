import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { IReactionRepository } from '@application/reactions/repositories/reaction.repository';
import { ReactionEntity } from '@application/reactions/domain/entities/reaction.entity';
import { ReactionTargetType } from '@application/reactions/domain/reaction-target-type.enum';
import { ReactionDoc } from '../entities/reaction.schema';

@Injectable()
export class ReactionRepository
  extends BaseRepository<ReactionEntity, ReactionDoc>
  implements IReactionRepository
{
  constructor(@InjectModel('Reaction') model: Model<ReactionDoc>) {
    super(model);
  }

  toDomain(doc: ReactionDoc): ReactionEntity {
    const result = ReactionEntity.create(
      {
        tenantId: doc.tenantId,
        targetType: doc.targetType as ReactionTargetType,
        targetId: doc.targetId,
        emoji: doc.emoji,
        userId: doc.userId,
        userName: doc.userName,
        createdAt: doc.createdAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(r: ReactionEntity): Partial<ReactionDoc> {
    return {
      _id: r.id.toString(),
      tenantId: r.tenantId,
      targetType: r.targetType,
      targetId: r.targetId,
      emoji: r.emoji,
      userId: r.userId,
      userName: r.userName,
      createdAt: r.createdAt,
    };
  }

  async findByTarget(
    tenantId: string,
    targetType: ReactionTargetType,
    targetId: string,
  ): Promise<ReactionEntity[]> {
    const docs = await this.model
      .find({ tenantId, targetType, targetId })
      .sort({ createdAt: 1 })
      .lean<ReactionDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async findOne(
    tenantId: string,
    targetType: ReactionTargetType,
    targetId: string,
    emoji: string,
    userId: string,
  ): Promise<ReactionEntity | null> {
    const doc = await this.model
      .findOne({ tenantId, targetType, targetId, emoji, userId })
      .lean<ReactionDoc>()
      .exec();
    return doc ? this.toDomain(doc) : null;
  }

  async add(reaction: ReactionEntity): Promise<void> {
    try {
      await this.model.create(this.toDocument(reaction));
    } catch (e: unknown) {
      // A racing double-add trips the unique index — treat as already-reacted.
      if ((e as { code?: number })?.code === 11000) return;
      throw e;
    }
  }

  async removeById(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }
}
