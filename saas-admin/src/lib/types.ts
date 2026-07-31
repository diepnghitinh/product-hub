/**
 * The shapes `/v1/platform/*` returns. Mirrors the backend DTOs, which are flat
 * by house style — a row carries the plan and usage numbers a reader needs
 * rather than nesting them.
 */

export type TenantStatus = 'active' | 'suspended';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled';
export type BillingCycle = 'monthly' | 'yearly';
export type FeatureType = 'flag' | 'metered';

export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  'trial',
  'active',
  'past_due',
  'canceled',
];
export const BILLING_CYCLES: BillingCycle[] = ['monthly', 'yearly'];

export interface PlatformAdmin {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface PlatformAuthResponse {
  token: string;
  admin: PlatformAdmin;
}

/** A plan's grant for one feature. Sparse — unset keys inherit from the base. */
export interface FeatureEntitlement {
  enabled?: boolean;
  limit?: number;
  name?: string;
  type?: FeatureType;
}

export type FeatureMap = Record<string, FeatureEntitlement>;

export interface FeatureCatalogItem {
  key: string;
  name: string;
  type: FeatureType;
  unit: string | null;
  group: 'limits' | 'capabilities';
  resourceKey: string | null;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  /** This plan's own grants only. */
  features: FeatureMap;
  extendsCode: string | null;
  /** Own grants merged over the whole inheritance chain. */
  effectiveFeatures: FeatureMap;
  isActive: boolean;
  sortOrder: number;
  subscriberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string | null;
  status: TenantStatus;
  contactEmail: string | null;
  notes: string | null;

  planCode: string | null;
  planName: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  billingCycle: BillingCycle | null;
  currentPeriodEnd: string | null;

  userCount: number;
  projectCount: number;
  issueCount: number;
  docCount: number;
  teamCount: number;
  roadmapCount: number;

  createdAt: string;
  updatedAt: string;
}

export interface TenantUsageLine {
  key: string;
  name: string;
  unit: string | null;
  used: number;
  /** -1 means unlimited. */
  limit: number;
  /** Percent of limit used; null when unlimited. */
  percent: number | null;
  overLimit: boolean;
}

export interface TenantDetail extends Tenant {
  usage: TenantUsageLine[];
  entitlements: FeatureMap;
  adminEmails: string[];
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Subscription {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string | null;
  tenantStatus: TenantStatus;
  planCode: string;
  planName: string | null;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  monthlyEquivalent: number;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  featureOverrides: FeatureMap;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformOverview {
  tenantCount: number;
  activeTenantCount: number;
  suspendedTenantCount: number;
  userCount: number;
  subscribedTenantCount: number;
  trialTenantCount: number;
  pastDueTenantCount: number;
  unassignedTenantCount: number;
  mrr: number;
  currency: string;
  overLimitTenantCount: number;
}

// ── Request payloads ──

export interface CreateTenantPayload {
  name: string;
  slug?: string;
  contactEmail?: string;
  notes?: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  planCode?: string;
}

export interface UpdateTenantPayload {
  name?: string;
  slug?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
}

export interface PlanPayload {
  code?: string;
  name?: string;
  description?: string | null;
  priceMonthly?: number;
  priceYearly?: number;
  currency?: string;
  features?: FeatureMap;
  extendsCode?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface UpsertSubscriptionPayload {
  planCode: string;
  status?: SubscriptionStatus;
  billingCycle?: BillingCycle;
  currentPeriodEnd?: string | null;
  cancelAt?: string | null;
  featureOverrides?: FeatureMap;
  notes?: string | null;
}
