import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { FeatureMap } from '@application/platform/domain/features';
import {
  BillingCycle,
  SubscriptionStatus,
} from '@application/platform/domain/entities/subscription.props';

export interface SubscriptionDoc {
  _id: string;
  tenantId: string;
  planCode: string;
  status: string;
  billingCycle: string;
  currentPeriodEnd?: Date | null;
  cancelAt?: Date | null;
  featureOverrides: FeatureMap;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const SubscriptionSchema = new Schema<SubscriptionDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true },
    planCode: { type: String, required: true, lowercase: true, maxlength: 60 },
    status: {
      type: String,
      enum: Object.values(SubscriptionStatus),
      default: SubscriptionStatus.ACTIVE,
    },
    billingCycle: {
      type: String,
      enum: Object.values(BillingCycle),
      default: BillingCycle.MONTHLY,
    },
    currentPeriodEnd: { type: Date, default: null },
    cancelAt: { type: Date, default: null },
    featureOverrides: { type: Schema.Types.Mixed, default: {} },
    notes: { type: String, default: null, maxlength: 2000 },
  },
  { timestamps: true, collection: 'subscriptions' },
);

// One subscription per tenant — the uniqueness is the model, not a convention.
SubscriptionSchema.index({ tenantId: 1 }, { unique: true });
SubscriptionSchema.index({ planCode: 1 });
