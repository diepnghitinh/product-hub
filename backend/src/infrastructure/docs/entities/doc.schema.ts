import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';

export interface DocDoc {
  _id: string;
  tenantId: string;
  ref: string;
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
    // The URL handle (`DOC-6HCUHKX`). '' for docs written before refs existed —
    // the compound index below is partial so those don't all collide on ''.
    ref: { type: String, default: '' },
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

// A ref resolves a URL, so it has to be unique — but only within its tenant, and
// only among docs that actually have one. `partialFilterExpression` keeps the
// pre-ref docs (ref: '') out of the index entirely instead of colliding on ''.
DocSchema.index(
  { tenantId: 1, ref: 1 },
  { unique: true, partialFilterExpression: { ref: { $type: 'string', $gt: '' } } },
);
