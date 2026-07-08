import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';

export interface ApiKeyDoc {
  _id: string;
  tenantId: string;
  name: string;
  keyHash: string;
  prefix: string;
  createdBy: string;
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
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
