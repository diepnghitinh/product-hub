import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { AuditActor, AuditEntity } from '@application/audit-log/domain/enums/audit.enums';

export interface AuditLogDoc {
  _id: string;
  tenantId: string;
  projectId: string;
  reportId: string;
  entity: AuditEntity;
  entityRef: string;
  field: string;
  oldValue: string;
  newValue: string;
  actorType: AuditActor;
  actorId: string;
  actorName: string;
  createdAt: Date;
}

export const AuditLogSchema = new Schema<AuditLogDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    projectId: { type: String, required: true, index: true },
    reportId: { type: String, default: '' },
    entity: { type: String, enum: Object.values(AuditEntity), required: true },
    entityRef: { type: String, default: '' },
    field: { type: String, default: '' },
    oldValue: { type: String, default: '' },
    newValue: { type: String, default: '' },
    actorType: { type: String, enum: Object.values(AuditActor), required: true },
    actorId: { type: String, default: '' },
    actorName: { type: String, default: '' },
  },
  // Only createdAt matters — entries are immutable.
  { timestamps: { createdAt: true, updatedAt: false } },
);
