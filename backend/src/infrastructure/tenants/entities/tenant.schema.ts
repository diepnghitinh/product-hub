import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { TenantStatus } from '@application/tenants/domain/entities/tenant.props';

export interface TenantDoc {
  _id: string;
  name: string;
  slug?: string | null;
  status?: string;
  contactEmail?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const TenantSchema = new Schema<TenantDoc>(
  {
    _id: { type: String, default: () => uuid() },
    name: { type: String, required: true, maxlength: 120 },
    // Added when the platform console arrived. Every field below is optional so
    // tenants created before it read back unchanged — `status` falls back to
    // active in the entity factory.
    slug: { type: String, default: null, maxlength: 60 },
    status: {
      type: String,
      enum: Object.values(TenantStatus),
      default: TenantStatus.ACTIVE,
    },
    contactEmail: { type: String, default: null, maxlength: 200 },
    notes: { type: String, default: null, maxlength: 2000 },
  },
  { timestamps: true },
);

// Sparse: most tenants have no slug, and null must not collide with null.
TenantSchema.index({ slug: 1 }, { unique: true, sparse: true });
TenantSchema.index({ status: 1, createdAt: -1 });
