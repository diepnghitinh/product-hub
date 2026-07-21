import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';

export interface ReactionDoc {
  _id: string;
  tenantId: string;
  targetType: string;
  targetId: string;
  emoji: string;
  userId: string;
  userName: string;
  createdAt: Date;
}

export const ReactionSchema = new Schema<ReactionDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String, required: true },
    emoji: { type: String, required: true },
    userId: { type: String, required: true },
    userName: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One reaction per (target, emoji, user) — the safety net behind toggling.
ReactionSchema.index(
  { tenantId: 1, targetType: 1, targetId: 1, emoji: 1, userId: 1 },
  { unique: true },
);
// Fast "all reactions on this target" lookups.
ReactionSchema.index({ tenantId: 1, targetType: 1, targetId: 1 });
