import { UsageResourceKey } from '../domain/features';

/** How much of each countable resource one tenant is using right now. */
export type TenantUsage = Record<UsageResourceKey, number>;

/**
 * Port for cross-tenant usage counts.
 *
 * Deliberately *not* a per-feature repository: the adapter counts straight off
 * the collections the app already writes, so there is no counter to keep in sync
 * and no way for the reported number to drift from reality. The trade-off is that
 * it's a read-time aggregate — fine at the scale a platform console runs at, and
 * the place to add a cached rollup if that ever stops being true.
 */
export abstract class IPlatformUsageRepository {
  /** Usage for one tenant. */
  forTenant: (tenantId: string) => Promise<TenantUsage>;
  /** Usage for many tenants in one pass — the list view's data source. */
  forTenants: (tenantIds: string[]) => Promise<Record<string, TenantUsage>>;
}
