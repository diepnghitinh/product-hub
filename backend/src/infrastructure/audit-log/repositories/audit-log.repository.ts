import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import {
  AuditLogPaginationResponse,
  IAuditLogRepository,
} from '@application/audit-log/repositories/audit-log.repository';
import { AuditLogEntity } from '@application/audit-log/domain/entities/audit-log.entity';
import { AuditActor, AuditEntity } from '@application/audit-log/domain/enums/audit.enums';
import { PaginationDto } from '@module-shared/modules/pagination/pagination.dto';
import { AuditLogDoc } from '../entities/audit-log.schema';

@Injectable()
export class AuditLogRepository
  extends BaseRepository<AuditLogEntity, AuditLogDoc>
  implements IAuditLogRepository
{
  constructor(@InjectModel('AuditLog') model: Model<AuditLogDoc>) {
    super(model);
  }

  toDomain(doc: AuditLogDoc): AuditLogEntity {
    const result = AuditLogEntity.create(
      {
        tenantId: doc.tenantId,
        projectId: doc.projectId,
        reportId: doc.reportId,
        entity: doc.entity as AuditEntity,
        entityRef: doc.entityRef,
        field: doc.field,
        oldValue: doc.oldValue,
        newValue: doc.newValue,
        actorType: doc.actorType as AuditActor,
        actorId: doc.actorId,
        actorName: doc.actorName,
        createdAt: doc.createdAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(entry: AuditLogEntity): Partial<AuditLogDoc> {
    return {
      _id: entry.id.toString(),
      tenantId: entry.tenantId,
      projectId: entry.projectId,
      reportId: entry.reportId,
      entity: entry.entity,
      entityRef: entry.entityRef,
      field: entry.field,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      actorType: entry.actorType,
      actorId: entry.actorId,
      actorName: entry.actorName,
      createdAt: entry.createdAt,
    };
  }

  async append(entry: AuditLogEntity): Promise<void> {
    await this.model.create(this.toDocument(entry));
  }

  async findByProject(
    tenantId: string,
    projectId: string,
    query: PaginationDto,
  ): Promise<AuditLogPaginationResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const filter = { tenantId, projectId };

    const [docs, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<AuditLogDoc[]>()
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
