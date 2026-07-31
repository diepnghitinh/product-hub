import { UniqueEntityID } from '@core/domain';
import { FeatureMap } from '../features';

export enum SubscriptionStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
}

export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.CANCELED,
];

export enum BillingCycle {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export const BILLING_CYCLES: BillingCycle[] = [
  BillingCycle.MONTHLY,
  BillingCycle.YEARLY,
];

export interface SubscriptionProps {
  id: UniqueEntityID;
  /** One subscription per tenant — this is also the natural key. */
  tenantId: string;
  planCode: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  /** When the current period ends (renewal or trial expiry). */
  currentPeriodEnd?: Date | null;
  /** Set when a cancellation is scheduled rather than immediate. */
  cancelAt?: Date | null;
  /** Per-tenant deviations from the plan — the "we gave this customer 50 extra
   *  seats" case, without minting a bespoke plan for them. */
  featureOverrides: FeatureMap;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
