import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { McpEventEntity } from '@application/mcp/domain/entities/mcp-event.entity';
import { McpEntity } from '@application/mcp/domain/enums/mcp.enums';
import {
  IMcpEventRepository,
  McpEventPaginationResponse,
} from '@application/mcp/repositories/mcp-event.repository';
import { PaginationDto } from '@module-shared/modules/pagination/pagination.dto';
import { McpEventDoc } from '../entities/mcp-event.schema';

@Injectable()
export class McpEventRepository
  extends BaseRepository<McpEventEntity, McpEventDoc>
  implements IMcpEventRepository
{
  constructor(@InjectModel('McpEvent') model: Model<McpEventDoc>) {
    super(model);
  }

  toDomain(doc: McpEventDoc): McpEventEntity {
    const result = McpEventEntity.create(
      {
        tenantId: doc.tenantId,
        keyId: doc.keyId,
        keyName: doc.keyName,
        userId: doc.userId,
        userName: doc.userName,
        clientName: doc.clientName,
        tool: doc.tool,
        entity: doc.entity as McpEntity,
        entityId: doc.entityId,
        entityRef: doc.entityRef,
        entityTitle: doc.entityTitle,
        contextLabel: doc.contextLabel,
        link: doc.link,
        createdAt: doc.createdAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(event: McpEventEntity): Partial<McpEventDoc> {
    return {
      _id: event.id.toString(),
      tenantId: event.tenantId,
      keyId: event.keyId,
      keyName: event.keyName,
      userId: event.userId,
      userName: event.userName,
      clientName: event.clientName,
      tool: event.tool,
      entity: event.entity,
      entityId: event.entityId,
      entityRef: event.entityRef,
      entityTitle: event.entityTitle,
      contextLabel: event.contextLabel,
      link: event.link,
      createdAt: event.createdAt,
    };
  }

  async append(event: McpEventEntity): Promise<void> {
    await this.model.create(this.toDocument(event));
  }

  async findByTenant(
    tenantId: string,
    query: PaginationDto,
  ): Promise<McpEventPaginationResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const filter: FilterQuery<McpEventDoc> = { tenantId };
    if (query.search) {
      // Escaped: free text from a search box would otherwise throw on `(`.
      const re = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ entityTitle: re }, { entityRef: re }, { contextLabel: re }];
    }

    const [docs, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<McpEventDoc[]>()
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
}
