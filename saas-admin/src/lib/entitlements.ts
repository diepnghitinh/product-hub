import type { FeatureMap, Plan, Subscription, Tenant } from './types';

/**
 * A tenant's effective entitlements, assembled from data the console already
 * has: the plan's `effectiveFeatures` (the server already folded the whole
 * inheritance chain into it) with the subscription's per-tenant overrides on
 * top.
 *
 * This is the same merge `GET /platform/tenants/:id` does server-side. Doing it
 * here is what lets the usage page rank *every* workspace on one screen instead
 * of firing a detail request per row — but it means the ordering must not drift:
 * plan chain first, overrides last, override wins.
 */
export function effectiveFeatures(
  plan: Plan | undefined,
  subscription: Subscription | undefined,
): FeatureMap {
  const base = plan?.effectiveFeatures ?? {};
  const overrides = subscription?.featureOverrides;
  if (!overrides) return base;
  const result: FeatureMap = { ...base };
  for (const [key, grant] of Object.entries(overrides)) {
    result[key] = { ...(result[key] ?? {}), ...grant };
  }
  return result;
}

/** The six things the platform can count, and where they live on a tenant row. */
export const USAGE_RESOURCES = [
  { key: 'users', label: 'Members', field: 'userCount' },
  { key: 'projects', label: 'Test projects', field: 'projectCount' },
  { key: 'issues', label: 'Issues', field: 'issueCount' },
  { key: 'docs', label: 'Docs', field: 'docCount' },
  { key: 'teams', label: 'Teams', field: 'teamCount' },
  { key: 'roadmaps', label: 'Roadmaps', field: 'roadmapCount' },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  field: keyof Tenant;
}>;

export type UsageResource = (typeof USAGE_RESOURCES)[number];

export interface UsageRow {
  used: number;
  /** -1 unlimited, 0 not granted. */
  limit: number;
  /** null when unlimited or ungranted — a percentage would be meaningless. */
  percent: number | null;
  overLimit: boolean;
}

export function usageFor(
  tenant: Tenant,
  features: FeatureMap,
  resource: UsageResource,
): UsageRow {
  const used = (tenant[resource.field] as number) ?? 0;
  const limit = features[resource.key]?.limit ?? 0;
  const unlimited = limit < 0;
  return {
    used,
    limit,
    percent: unlimited || limit === 0 ? null : Math.round((used / limit) * 100),
    overLimit: !unlimited && limit > 0 && used >= limit,
  };
}
