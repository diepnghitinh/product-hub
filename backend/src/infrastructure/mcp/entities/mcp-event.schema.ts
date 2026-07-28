import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { McpEntity } from '@application/mcp/domain/enums/mcp.enums';

export interface McpEventDoc {
  _id: string;
  tenantId: string;
  keyId: string;
  keyName: string;
  userId: string;
  userName: string;
  clientName: string;
  tool: string;
  entity: McpEntity;
  entityId: string;
  entityRef: string;
  entityTitle: string;
  contextLabel: string;
  link: string;
  createdAt: Date;
}

export const McpEventSchema = new Schema<McpEventDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    keyId: { type: String, default: '' },
    keyName: { type: String, default: '' },
    userId: { type: String, default: '' },
    userName: { type: String, default: '' },
    clientName: { type: String, default: '' },
    tool: { type: String, default: '' },
    entity: { type: String, enum: Object.values(McpEntity), required: true },
    entityId: { type: String, required: true },
    entityRef: { type: String, default: '' },
    entityTitle: { type: String, default: '' },
    contextLabel: { type: String, default: '' },
    link: { type: String, default: '' },
  },
  // Only createdAt matters — entries are immutable.
  { timestamps: { createdAt: true, updatedAt: false } },
);
