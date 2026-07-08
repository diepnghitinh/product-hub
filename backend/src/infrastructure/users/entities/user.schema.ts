import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { Role } from '@core/interfaces';

export interface UserDoc {
  _id: string;
  tenantId: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  inboxSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = new Schema<UserDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    // Email is globally unique so login can resolve the tenant from the account.
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 190,
    },
    name: { type: String, required: true, maxlength: 120 },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: Object.values(Role), default: Role.TESTER },
    inboxSeenAt: { type: Date, default: null },
  },
  { timestamps: true },
);
