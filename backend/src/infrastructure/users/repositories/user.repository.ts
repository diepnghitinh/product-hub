import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { Role } from '@core/interfaces';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import {
  IUserRepository,
  UserPaginationResponse,
} from '@application/users/repositories/user.repository';
import { UserEntity } from '@application/users/domain/entities/user.entity';
import { QueryUserDto } from '@application/users/dtos/query-user.dto';
import { UserDoc } from '../entities/user.schema';

@Injectable()
export class UserRepository
  extends BaseRepository<UserEntity, UserDoc>
  implements IUserRepository
{
  constructor(@InjectModel('User') model: Model<UserDoc>) {
    super(model);
  }

  toDomain(doc: UserDoc): UserEntity {
    const result = UserEntity.create(
      {
        tenantId: doc.tenantId,
        email: doc.email,
        name: doc.name,
        passwordHash: doc.passwordHash,
        role: doc.role as Role,
        avatarUrl: doc.avatarUrl ?? null,
        inboxSeenAt: doc.inboxSeenAt,
        lastActiveAt: doc.lastActiveAt ?? null,
        favourites: doc.favourites ?? [],
        personalStatuses: doc.personalStatuses ?? [],
        readInboxKeys: doc.readInboxKeys ?? [],
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  /**
   * Note there's no `lastActiveAt` here, deliberately. `save` overwrites every
   * field it lists, and an entity can be seconds stale by the time it's written
   * back — including the stamp would let a slow role change roll "last online"
   * backwards. `touchLastActive` is its only writer.
   */
  toDocument(user: UserEntity): Partial<UserDoc> {
    return {
      _id: user.id.toString(),
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash,
      role: user.role,
      avatarUrl: user.avatarUrl ?? null,
      inboxSeenAt: user.inboxSeenAt ?? null,
      favourites: user.favourites,
      personalStatuses: user.personalStatuses,
      readInboxKeys: user.readInboxKeys,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async findById(id: string): Promise<UserEntity | null> {
    const doc = await this.model.findById(id).lean<UserDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const doc = await this.model
      .findOne({ email: email.trim().toLowerCase() })
      .lean<UserDoc>()
      .exec();
    return doc ? this.toDomain(doc) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.model
      .countDocuments({ email: email.trim().toLowerCase() })
      .exec();
    return count > 0;
  }

  async findByTenant(tenantId: string, query: QueryUserDto): Promise<UserPaginationResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const filter: Record<string, unknown> = { tenantId };

    if (query.role) {
      filter.role = query.role;
    }
    if (query.search) {
      const re = new RegExp(query.search, 'i');
      filter.$or = [{ name: re }, { email: re }];
    }

    const [docs, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<UserDoc[]>()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return {
      data: docs.map((d) => this.toDomain(d)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async save(user: UserEntity): Promise<void> {
    const doc = this.toDocument(user);
    await this.model
      .findByIdAndUpdate(doc._id, doc, { upsert: true, setDefaultsOnInsert: true, new: true })
      .exec();
  }

  async update(user: UserEntity): Promise<void> {
    await this.save(user);
  }

  async touchLastActive(id: string, at: Date): Promise<void> {
    // `timestamps: false` keeps this off `updatedAt` — being online isn't an edit,
    // and anything sorting people by "recently changed" shouldn't reshuffle just
    // because someone opened the app.
    await this.model
      .updateOne({ _id: id }, { $set: { lastActiveAt: at } }, { timestamps: false })
      .exec();
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }
}
