import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';

export interface IssueLinkDoc {
  _id: string;
  tenantId: string;
  /** 'task' | 'bug' — the *source* end's kind. The target end may differ
   *  (cross-type links); its kind is resolved on read, not stored here. */
  issueType: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  createdBy: string;
  createdAt: Date;
}

export const IssueLinkSchema = new Schema<IssueLinkDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true },
    issueType: { type: String, required: true },
    sourceId: { type: String, required: true },
    targetId: { type: String, required: true },
    relationType: { type: String, required: true },
    createdBy: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One link per (source, target, type) — the safety net behind create.
IssueLinkSchema.index(
  { tenantId: 1, issueType: 1, sourceId: 1, targetId: 1, relationType: 1 },
  { unique: true },
);
// The two directions an issue's relations are gathered from. Kind-agnostic: an
// issue's list spans both ends regardless of the other end's kind, so these are
// keyed by id alone (no issueType) to serve the cross-type read.
IssueLinkSchema.index({ tenantId: 1, sourceId: 1 });
IssueLinkSchema.index({ tenantId: 1, targetId: 1 });
