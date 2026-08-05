import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { ApiKeyScope } from '@application/api-keys/domain/api-key.enums';

export interface ApiKeyDoc {
  _id: string;
  tenantId: string;
  name: string;
  keyHash: string;
  prefix: string;
  createdBy: string;
  scope: ApiKeyScope;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export const ApiKeySchema = new Schema<ApiKeyDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    keyHash: { type: String, required: true, unique: true, index: true },
    prefix: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    // New keys are read-only. Keys written before this field existed have no
    // `scope` in the DB; the repository grandfathers those to read-write-delete
    // on read — see api-key.repository.ts (toDomain).
    scope: { type: String, enum: Object.values(ApiKeyScope), default: ApiKeyScope.READ_ONLY },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
