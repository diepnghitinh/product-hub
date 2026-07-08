import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import {
  IProjectRepository,
  ProjectPaginationResponse,
} from '@application/projects/repositories/project.repository';
import { ProjectEntity } from '@application/projects/domain/entities/project.entity';
import { Environment } from '@application/projects/domain/enums/environment.enum';
import { QueryProjectDto } from '@application/projects/dtos/query-project.dto';
import { ProjectDoc } from '../entities/project.schema';

@Injectable()
export class ProjectRepository
  extends BaseRepository<ProjectEntity, ProjectDoc>
  implements IProjectRepository
{
  constructor(@InjectModel('Project') model: Model<ProjectDoc>) {
    super(model);
  }

  toDomain(doc: ProjectDoc): ProjectEntity {
    const result = ProjectEntity.create(
      {
        tenantId: doc.tenantId,
        slug: doc.slug,
        title: doc.title,
        subtitle: doc.subtitle,
        owner: doc.owner,
        createdBy: doc.createdBy,
        sharedWith: doc.sharedWith,
        pinned: doc.pinned,
        environment: doc.environment as Environment,
        publicEnabled: doc.publicEnabled,
        publicToken: doc.publicToken,
        deletedAt: doc.deletedAt,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(project: ProjectEntity): Partial<ProjectDoc> {
    return {
      _id: project.id.toString(),
      tenantId: project.tenantId,
      slug: project.slug,
      title: project.title,
      subtitle: project.subtitle,
      owner: project.owner,
      createdBy: project.createdBy,
      sharedWith: project.sharedWith,
      pinned: project.pinned,
      environment: project.environment,
      publicEnabled: project.publicEnabled,
      publicToken: project.publicToken,
      deletedAt: project.deletedAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  async findById(id: string): Promise<ProjectEntity | null> {
    const doc = await this.model.findById(id).lean<ProjectDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByPublicToken(token: string): Promise<ProjectEntity | null> {
    const doc = await this.model
      .findOne({ publicToken: token, publicEnabled: true, deletedAt: null })
      .lean<ProjectDoc>()
      .exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByTenant(
    tenantId: string,
    query: QueryProjectDto,
  ): Promise<ProjectPaginationResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const filter: Record<string, unknown> = {
      tenantId,
      deletedAt: query.archived ? { $ne: null } : null,
    };

    if (query.environment) {
      filter.environment = query.environment;
    }
    if (query.search) {
      const re = new RegExp(query.search, 'i');
      filter.$or = [{ title: re }, { subtitle: re }, { owner: re }];
    }

    const [docs, total] = await Promise.all([
      this.model
        .find(filter)
        // Pinned first, then most-recently-updated (Dashboard ordering).
        .sort({ pinned: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<ProjectDoc[]>()
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

  async existsBySlug(tenantId: string, slug: string): Promise<boolean> {
    const count = await this.model
      .countDocuments({ tenantId, slug, deletedAt: null })
      .exec();
    return count > 0;
  }

  async save(project: ProjectEntity): Promise<void> {
    const doc = this.toDocument(project);
    await this.model
      .findByIdAndUpdate(doc._id, doc, { upsert: true, setDefaultsOnInsert: true, new: true })
      .exec();
  }

  async update(project: ProjectEntity): Promise<void> {
    await this.save(project);
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }
}
