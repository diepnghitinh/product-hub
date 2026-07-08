import { ApiProperty } from '@nestjs/swagger';
import { AuditActor, AuditEntity } from '../domain/enums/audit.enums';

/** Flat audit entry shape for the History dialog. */
export class AuditLogResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty()
  reportId: string;

  @ApiProperty({ enum: AuditEntity })
  entity: AuditEntity;

  @ApiProperty()
  entityRef: string;

  @ApiProperty()
  field: string;

  @ApiProperty()
  oldValue: string;

  @ApiProperty()
  newValue: string;

  @ApiProperty({ enum: AuditActor })
  actorType: AuditActor;

  @ApiProperty()
  actorName: string;

  @ApiProperty()
  createdAt: Date;
}
