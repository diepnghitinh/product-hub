import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import {
  IPlatformUsageRepository,
  TenantUsage,
} from '@application/platform/repositories/platform-usage.repository';
import {
  USAGE_RESOURCE_KEYS,
  UsageResourceKey,
} from '@application/platform/domain/features';

/**
 * Which collection backs each countable resource.
 *
 * These are Mongoose's pluralized model names (`Issue` → `issues`). Reading the
 * raw collections rather than injecting six feature repositories keeps the
 * platform module from depending on half the app. The cost is a real one: rename
 * a model and the matching number here silently drops to zero instead of failing
 * — so this map has to be updated alongside any model rename.
 */
const COLLECTIONS: Record<UsageResourceKey, string> = {
  users: 'users',
  projects: 'projects',
  issues: 'issues',
  docs: 'docs',
  teams: 'teams',
  roadmaps: 'roadmaps',
};

const emptyUsage = (): TenantUsage =>
  USAGE_RESOURCE_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as TenantUsage);

@Injectable()
export class PlatformUsageRepository implements IPlatformUsageRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async forTenant(tenantId: string): Promise<TenantUsage> {
    const counts = await Promise.all(
      USAGE_RESOURCE_KEYS.map(async (key) => {
        const n = await this.connection
          .collection(COLLECTIONS[key])
          .countDocuments({ tenantId });
        return [key, n] as const;
      }),
    );
    const usage = emptyUsage();
    for (const [key, n] of counts) usage[key] = n;
    return usage;
  }

  async forTenants(tenantIds: string[]): Promise<Record<string, TenantUsage>> {
    const result: Record<string, TenantUsage> = {};
    for (const id of tenantIds) result[id] = emptyUsage();
    if (tenantIds.length === 0) return result;

    // One grouped aggregate per collection rather than one countDocuments per
    // (tenant × resource) — six round-trips instead of 6N.
    await Promise.all(
      USAGE_RESOURCE_KEYS.map(async (key) => {
        const rows = await this.connection
          .collection(COLLECTIONS[key])
          .aggregate<{ _id: string; n: number }>([
            { $match: { tenantId: { $in: tenantIds } } },
            { $group: { _id: '$tenantId', n: { $sum: 1 } } },
          ])
          .toArray();
        for (const row of rows) {
          if (result[row._id]) result[row._id][key] = row.n;
        }
      }),
    );

    return result;
  }
}
