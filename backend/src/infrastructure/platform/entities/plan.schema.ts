import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { FeatureMap } from '@application/platform/domain/features';

export interface PlanDoc {
  _id: string;
  code: string;
  name: string;
  description?: string | null;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  features: FeatureMap;
  extendsCode?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export const PlanSchema = new Schema<PlanDoc>(
  {
    _id: { type: String, default: () => uuid() },
    code: { type: String, required: true, lowercase: true, trim: true, maxlength: 60 },
    name: { type: String, required: true, maxlength: 120 },
    description: { type: String, default: null, maxlength: 500 },
    priceMonthly: { type: Number, default: 0, min: 0 },
    priceYearly: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'USD', uppercase: true, maxlength: 3 },
    // Free-form by design: keys are feature codes the operator can extend past
    // the built-in catalog, so this is a bag rather than a sub-schema.
    features: { type: Schema.Types.Mixed, default: {} },
    extendsCode: { type: String, default: null, lowercase: true, maxlength: 60 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'plans' },
);

PlanSchema.index({ code: 1 }, { unique: true });
PlanSchema.index({ sortOrder: 1, createdAt: 1 });
