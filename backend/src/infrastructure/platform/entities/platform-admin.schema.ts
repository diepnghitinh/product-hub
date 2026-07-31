import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';

export interface PlatformAdminDoc {
  _id: string;
  email: string;
  name: string;
  passwordHash: string;
  isActive: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const PlatformAdminSchema = new Schema<PlatformAdminDoc>(
  {
    _id: { type: String, default: () => uuid() },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 200 },
    name: { type: String, required: true, maxlength: 120 },
    passwordHash: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'platformadmins' },
);

PlatformAdminSchema.index({ email: 1 }, { unique: true });
