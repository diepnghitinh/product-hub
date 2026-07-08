import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { Environment } from '@application/projects/domain/enums/environment.enum';

export interface ProjectDoc {
  _id: string;
  tenantId: string;
  slug: string;
  title: string;
  subtitle: string;
  owner: string;
  createdBy: string;
  sharedWith: string[];
  pinned: boolean;
  environment: Environment;
  publicEnabled: boolean;
  publicToken: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ProjectSchema = new Schema<ProjectDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    slug: { type: String, required: true },
    title: { type: String, required: true, maxlength: 160 },
    subtitle: { type: String, default: '' },
    owner: { type: String, default: '' },
    createdBy: { type: String, required: true },
    sharedWith: { type: [String], default: [] },
    pinned: { type: Boolean, default: false },
    environment: {
      type: String,
      enum: Object.values(Environment),
      default: Environment.DEVELOPMENT,
    },
    publicEnabled: { type: Boolean, default: false },
    publicToken: { type: String, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Slug is unique per tenant, but only among *active* projects — archived rows keep
// their slug without blocking reuse (partial index on `deletedAt: null`).
ProjectSchema.index(
  { tenantId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
