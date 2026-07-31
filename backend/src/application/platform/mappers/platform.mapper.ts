import { TenantEntity } from '@application/tenants/domain/entities/tenant.entity';
import { PlanEntity } from '../domain/entities/plan.entity';
import { PlatformAdminEntity } from '../domain/entities/platform-admin.entity';
import { SubscriptionEntity } from '../domain/entities/subscription.entity';
import {
  FEATURES,
  FeatureMap,
  resolveFeatureDef,
  UsageResourceKey,
} from '../domain/features';
import { PlatformAdminResponseDto } from '../dtos/platform-auth.dtos';
import { FeatureCatalogItemDto, PlanResponseDto } from '../dtos/plan.dtos';
import { SubscriptionResponseDto } from '../dtos/subscription.dtos';
import {
  TenantDetailResponseDto,
  TenantResponseDto,
  TenantUsageLineDto,
} from '../dtos/tenant.dtos';
import { TenantUsage } from '../repositories/platform-usage.repository';

const iso = (d?: Date | null): string | null => (d ? d.toISOString() : null);

export class PlatformAdminMapper {
  static toResponseDto(admin: PlatformAdminEntity): PlatformAdminResponseDto {
    return {
      id: admin.id.toString(),
      email: admin.email,
      name: admin.name,
      isActive: admin.isActive,
      lastLoginAt: iso(admin.lastLoginAt),
      createdAt: admin.createdAt.toISOString(),
    };
  }
}

export class PlanMapper {
  /**
   * `effectiveFeatures` and `subscriberCount` are resolved by the caller — both
   * need the rest of the catalog, which a mapper has no business fetching.
   */
  static toResponseDto(
    plan: PlanEntity,
    effectiveFeatures: FeatureMap,
    subscriberCount: number,
  ): PlanResponseDto {
    return {
      id: plan.id.toString(),
      code: plan.code,
      name: plan.name,
      description: plan.description,
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly,
      currency: plan.currency,
      features: plan.features,
      extendsCode: plan.extendsCode,
      effectiveFeatures,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
      subscriberCount,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    };
  }

  static featureCatalog(): FeatureCatalogItemDto[] {
    return FEATURES.map((f) => ({
      key: f.key,
      name: f.name,
      type: f.type,
      unit: f.unit ?? null,
      group: f.group,
      resourceKey: f.resourceKey ?? null,
    }));
  }
}

export class SubscriptionMapper {
  static toResponseDto(
    subscription: SubscriptionEntity,
    tenant: TenantEntity | undefined,
    plan: PlanEntity | undefined,
    monthlyEquivalent: number,
  ): SubscriptionResponseDto {
    return {
      id: subscription.id.toString(),
      tenantId: subscription.tenantId,
      // A subscription whose tenant was removed still has to render as a row —
      // it's exactly the orphan an operator needs to see and clean up.
      tenantName: tenant?.name ?? 'Unknown workspace',
      tenantSlug: tenant?.slug ?? null,
      tenantStatus: tenant?.status ?? 'unknown',
      planCode: subscription.planCode,
      planName: plan?.name ?? null,
      priceMonthly: plan?.priceMonthly ?? 0,
      priceYearly: plan?.priceYearly ?? 0,
      currency: plan?.currency ?? 'USD',
      status: subscription.status,
      billingCycle: subscription.billingCycle,
      monthlyEquivalent,
      currentPeriodEnd: iso(subscription.currentPeriodEnd),
      cancelAt: iso(subscription.cancelAt),
      featureOverrides: subscription.featureOverrides,
      notes: subscription.notes,
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString(),
    };
  }
}

/** Zero usage — what a tenant reads as before anything has been counted for it. */
export const EMPTY_USAGE: TenantUsage = {
  users: 0,
  projects: 0,
  issues: 0,
  docs: 0,
  teams: 0,
  roadmaps: 0,
};

export class PlatformTenantMapper {
  static toResponseDto(
    tenant: TenantEntity,
    subscription: SubscriptionEntity | undefined,
    plan: PlanEntity | undefined,
    usage: TenantUsage = EMPTY_USAGE,
  ): TenantResponseDto {
    return {
      id: tenant.id.toString(),
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      contactEmail: tenant.contactEmail,
      notes: tenant.notes,
      planCode: subscription?.planCode ?? null,
      planName: plan?.name ?? null,
      subscriptionStatus: subscription?.status ?? null,
      billingCycle: subscription?.billingCycle ?? null,
      currentPeriodEnd: iso(subscription?.currentPeriodEnd),
      userCount: usage.users,
      projectCount: usage.projects,
      issueCount: usage.issues,
      docCount: usage.docs,
      teamCount: usage.teams,
      roadmapCount: usage.roadmaps,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
    };
  }

  static toDetailDto(
    row: TenantResponseDto,
    usage: TenantUsage,
    entitlements: FeatureMap,
    adminEmails: string[],
  ): TenantDetailResponseDto {
    return { ...row, usage: usageLines(usage, entitlements), entitlements, adminEmails };
  }
}

/**
 * Pair every countable resource with the limit its entitlement grants.
 *
 * Only metered features backed by a `resourceKey` appear: a limit we can't count
 * against would render as a bar with no fill, which reads as "zero used" rather
 * than "not measured".
 */
export function usageLines(usage: TenantUsage, entitlements: FeatureMap): TenantUsageLineDto[] {
  return FEATURES.filter((f) => f.type === 'metered' && f.resourceKey).map((f) => {
    const def = resolveFeatureDef(f.key, entitlements[f.key]);
    const limit = entitlements[f.key]?.limit ?? 0;
    const used = usage[f.resourceKey as UsageResourceKey] ?? 0;
    const unlimited = limit < 0;
    return {
      key: f.key,
      name: def.name,
      unit: f.unit ?? null,
      used,
      limit,
      percent: unlimited || limit === 0 ? null : Math.round((used / limit) * 100),
      overLimit: !unlimited && limit > 0 && used >= limit,
    };
  });
}

/** True when any metered resource has reached its ceiling. */
export function isOverAnyLimit(usage: TenantUsage, entitlements: FeatureMap): boolean {
  return usageLines(usage, entitlements).some((line) => line.overLimit);
}
