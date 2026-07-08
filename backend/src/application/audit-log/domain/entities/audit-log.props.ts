import { UniqueEntityID } from '@core/domain';
import { AuditActor, AuditEntity } from '../enums/audit.enums';

export interface AuditLogProps {
  id: UniqueEntityID;
  tenantId: string;
  projectId: string;
  reportId: string;
  entity: AuditEntity;
  /** Human reference to the changed thing (case shortId / area, or report title). */
  entityRef: string;
  field: string;
  oldValue: string;
  newValue: string;
  actorType: AuditActor;
  actorId: string;
  actorName: string;
  createdAt: Date;
}
