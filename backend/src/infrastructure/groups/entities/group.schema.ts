import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';

export interface GroupDoc {
  _id: string;
  tenantId: string;
  projectId: string;
  slug: string;
  title: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export const GroupSchema = new Schema<GroupDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    projectId: { type: String, required: true, index: true },
    slug: { type: String, required: true },
    title: { type: String, required: true, maxlength: 160 },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// A slug is unique within a single project.
GroupSchema.index({ tenantId: 1, projectId: 1, slug: 1 }, { unique: true });
