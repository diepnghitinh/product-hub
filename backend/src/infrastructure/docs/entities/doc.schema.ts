import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';

export interface DocDoc {
  _id: string;
  tenantId: string;
  title: string;
  icon: string;
  color: string | null;
  coverUrl: string;
  tags: string[];
  createdBy: string;
  createdByName: string;
  publicEnabled: boolean;
  publicToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const DocSchema = new Schema<DocDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    title: { type: String, required: true, maxlength: 160 },
    icon: { type: String, default: '' },
    color: { type: String, default: null },
    coverUrl: { type: String, default: '' },
    // Multikey index: the hub filters by tag, and docs written before tags
    // existed simply have none.
    tags: { type: [String], default: [], index: true },
    createdBy: { type: String, default: '' },
    createdByName: { type: String, default: '' },
    publicEnabled: { type: Boolean, default: false },
    publicToken: { type: String, default: null },
  },
  { timestamps: true },
);
