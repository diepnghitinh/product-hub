import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';

export interface TenantDoc {
  _id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export const TenantSchema = new Schema<TenantDoc>(
  {
    _id: { type: String, default: () => uuid() },
    name: { type: String, required: true, maxlength: 120 },
  },
  { timestamps: true },
);
