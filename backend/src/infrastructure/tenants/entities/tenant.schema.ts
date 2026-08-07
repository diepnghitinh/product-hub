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

// Most tenants have no slug, and two of those must not collide.
//
// `sparse` is NOT enough here: it only skips documents where the field is
// *missing*, and `default: null` above means every tenant is written with an
// explicit `slug: null`. Under a sparse unique index the second workspace ever
// created fails with `E11000 … dup key: { slug: null }` — signup breaks for
// everyone after the first. A partial index on "slug is a string" indexes only
// the tenants that actually have one.
TenantSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: 'string' } } },
);
TenantSchema.index({ status: 1, createdAt: -1 });
