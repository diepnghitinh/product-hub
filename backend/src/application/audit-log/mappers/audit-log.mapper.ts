import { AuditLogEntity } from '../domain/entities/audit-log.entity';
import { AuditLogResponseDto } from '../dtos/audit-log.response.dto';

export class AuditLogMapper {
  static toResponseDto(entry: AuditLogEntity): AuditLogResponseDto {
    return {
      id: entry.id.toString(),
      projectId: entry.projectId,
      reportId: entry.reportId,
      entity: entry.entity,
      entityRef: entry.entityRef,
      field: entry.field,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      actorType: entry.actorType,
      actorName: entry.actorName,
      createdAt: entry.createdAt,
    };
  }

  static toResponseDtoArray(entries: AuditLogEntity[]): AuditLogResponseDto[] {
    return entries.map((e) => this.toResponseDto(e));
  }
}
