/**
 * The entitlement catalog — what a plan can grant.
 *
 * Two kinds only, because everything a SaaS sells reduces to one of them:
 *   • `flag`    — the capability is on or off (SSO, audit log, MCP…).
 *   • `metered` — the capability has a ceiling (25 users, 10 GB…).
 *
 * `resourceKey` ties a metered feature to something we can actually count in the
 * database (see `IPlatformUsageRepository`). A metered feature without one is a
 * number the operator maintains by hand — allowed, but it will never show a
 * "used" figure next to its limit.
 */
export type FeatureType = 'flag' | 'metered';

export interface FeatureDef {
  key: string;
  name: string;
  type: FeatureType;
  /** Shown after the number: "25 users", "10 GB". */
  unit?: string;
  /** Countable resource this meters, when one exists. */
  resourceKey?: UsageResourceKey;
  group: 'limits' | 'capabilities';
}

/** Everything the platform knows how to count for a tenant. */
export type UsageResourceKey =
  | 'users'
  | 'projects'
  | 'issues'
  | 'docs'
  | 'teams'
  | 'roadmaps';

export const USAGE_RESOURCE_KEYS: UsageResourceKey[] = [
  'users',
  'projects',
  'issues',
  'docs',
  'teams',
  'roadmaps',
];

export const FEATURES: FeatureDef[] = [
  // ── Limits (metered) ──
  { key: 'users', name: 'Members', type: 'metered', unit: 'members', resourceKey: 'users', group: 'limits' },
  { key: 'projects', name: 'Test projects', type: 'metered', unit: 'projects', resourceKey: 'projects', group: 'limits' },
  { key: 'issues', name: 'Issues', type: 'metered', unit: 'issues', resourceKey: 'issues', group: 'limits' },
  { key: 'docs', name: 'Docs', type: 'metered', unit: 'docs', resourceKey: 'docs', group: 'limits' },
  { key: 'teams', name: 'Teams', type: 'metered', unit: 'teams', resourceKey: 'teams', group: 'limits' },
  { key: 'roadmaps', name: 'Roadmaps', type: 'metered', unit: 'roadmaps', resourceKey: 'roadmaps', group: 'limits' },

  // ── Capabilities (flags) ──
  { key: 'cycles', name: 'Sprint cycles', type: 'flag', group: 'capabilities' },
  { key: 'okrs', name: 'OKRs & milestones', type: 'flag', group: 'capabilities' },
  { key: 'public_sharing', name: 'Public share links', type: 'flag', group: 'capabilities' },
  { key: 'collab_editing', name: 'Real-time doc editing', type: 'flag', group: 'capabilities' },
  { key: 'api_keys', name: 'API keys', type: 'flag', group: 'capabilities' },
  { key: 'mcp', name: 'MCP server', type: 'flag', group: 'capabilities' },
  { key: 'audit_log', name: 'Audit log', type: 'flag', group: 'capabilities' },
  { key: 'custom_storage', name: 'Own cloud storage (S3/Azure)', type: 'flag', group: 'capabilities' },
  { key: 'webhooks', name: 'Webhooks', type: 'flag', group: 'capabilities' },
  { key: 'priority_support', name: 'Priority support', type: 'flag', group: 'capabilities' },
];

export const getFeature = (key: string): FeatureDef | undefined =>
  FEATURES.find((f) => f.key === key);

/**
 * A plan's grant for one feature. Sparse on purpose: a plan states only what it
 * changes, and anything it doesn't mention is inherited from its base plan (or
 * falls back to off / zero).
 */
export interface FeatureEntitlement {
  /** `flag` features only. */
  enabled?: boolean;
  /** `metered` features only. -1 means unlimited. */
  limit?: number;
  /** Set on entitlements for keys outside {@link FEATURES}, so a custom feature
   *  added by the operator can still describe itself in the UI. */
  name?: string;
  type?: FeatureType;
}

export type FeatureMap = Record<string, FeatureEntitlement>;

/** The catalog definition for a key, or one synthesized from a custom grant. */
export function resolveFeatureDef(
  key: string,
  grant?: FeatureEntitlement | null,
): FeatureDef {
  const known = getFeature(key);
  if (known) return known;
  return {
    key,
    name: grant?.name ?? key,
    type: grant?.type ?? 'flag',
    group: grant?.type === 'metered' ? 'limits' : 'capabilities',
  };
}

const defaultGrant = (f: FeatureDef): FeatureEntitlement =>
  f.type === 'flag' ? { enabled: false } : { limit: 0 };

/**
 * Fold a plan's inheritance chain into one map — base first, each descendant
 * layered on top, per feature key.
 *
 * `chain` must be ordered base → leaf. Callers resolve the chain (walking
 * `extendsCode`) so this stays a pure function.
 */
export function mergeFeatureChain(chain: FeatureMap[]): FeatureMap {
  const result: FeatureMap = {};
  for (const f of FEATURES) result[f.key] = { ...defaultGrant(f) };
  for (const layer of chain) {
    for (const [key, grant] of Object.entries(layer ?? {})) {
      result[key] = { ...(result[key] ?? {}), ...grant };
    }
  }
  return result;
}

/** Effective entitlements = the plan chain, with a subscription's overrides on top. */
export function applyOverrides(
  planFeatures: FeatureMap,
  overrides?: FeatureMap | null,
): FeatureMap {
  if (!overrides) return planFeatures;
  const result: FeatureMap = { ...planFeatures };
  for (const [key, grant] of Object.entries(overrides)) {
    result[key] = { ...(result[key] ?? {}), ...grant };
  }
  return result;
}

/** Human-readable value of one entitlement, for tables and cards. */
export function formatEntitlement(
  def: FeatureDef,
  grant?: FeatureEntitlement,
): string {
  if (def.type === 'flag') return grant?.enabled ? 'On' : 'Off';
  const limit = grant?.limit;
  if (limit === undefined || limit === null) return '—';
  if (limit < 0) return 'Unlimited';
  return def.unit ? `${limit} ${def.unit}` : String(limit);
}
