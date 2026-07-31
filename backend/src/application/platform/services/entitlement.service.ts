import { Inject, Injectable } from '@nestjs/common';
import { PlanEntity } from '../domain/entities/plan.entity';
import { SubscriptionEntity } from '../domain/entities/subscription.entity';
import { BillingCycle } from '../domain/entities/subscription.props';
import { applyOverrides, FeatureMap, mergeFeatureChain } from '../domain/features';
import { IPlanRepository } from '../repositories/plan.repository';

/**
 * Turns a plan's *stored* grants into the set a tenant actually gets.
 *
 * Two layers, resolved at read time rather than baked in at write time:
 *   1. the plan's inheritance chain (`extendsCode`, base → leaf), and
 *   2. the subscription's per-tenant overrides on top.
 *
 * Read-time resolution is what makes "Pro is Free plus X" stay true after Free
 * changes. The cost is that every read of an effective set needs the whole plan
 * catalog — hence {@link index}, which callers fetch once and pass down.
 */
@Injectable()
export class EntitlementService {
  constructor(@Inject(IPlanRepository) private readonly plans: IPlanRepository) {}

  /** The whole catalog keyed by code — the input every resolve step needs. */
  async index(): Promise<Map<string, PlanEntity>> {
    const all = await this.plans.findAll();
    return new Map(all.map((p) => [p.code, p]));
  }

  /**
   * Fold a plan and everything it extends into one map.
   *
   * Cycle-safe by construction: a code already visited stops the walk, so a
   * catalog that somehow contains a loop resolves to a partial answer instead of
   * hanging. Writes are guarded separately by {@link wouldCycle}.
   */
  resolve(plan: PlanEntity, byCode: Map<string, PlanEntity>): FeatureMap {
    const chain: FeatureMap[] = [];
    const seen = new Set<string>();
    let current: PlanEntity | undefined = plan;

    while (current && !seen.has(current.code)) {
      seen.add(current.code);
      chain.unshift(current.features); // base ends up first
      current = current.extendsCode ? byCode.get(current.extendsCode) : undefined;
    }

    return mergeFeatureChain(chain);
  }

  /** Everything a tenant is entitled to: plan chain, then their own overrides. */
  effective(
    subscription: SubscriptionEntity | null,
    byCode: Map<string, PlanEntity>,
  ): FeatureMap {
    if (!subscription) return mergeFeatureChain([]);
    const plan = byCode.get(subscription.planCode);
    const base = plan ? this.resolve(plan, byCode) : mergeFeatureChain([]);
    return applyOverrides(base, subscription.featureOverrides);
  }

  /**
   * True when pointing `planCode` at `baseCode` would close a loop.
   *
   * Walks up from the proposed base: if we get back to the plan being edited,
   * the edit is refused. Without this, `resolve` would silently truncate and the
   * operator would never learn why their grants stopped inheriting.
   */
  wouldCycle(
    planCode: string,
    baseCode: string | null,
    byCode: Map<string, PlanEntity>,
  ): boolean {
    if (!baseCode) return false;
    if (baseCode === planCode) return true;

    const seen = new Set<string>([planCode]);
    let current = byCode.get(baseCode);
    while (current) {
      if (seen.has(current.code)) return true;
      seen.add(current.code);
      current = current.extendsCode ? byCode.get(current.extendsCode) : undefined;
    }
    return false;
  }

  /** A subscription's price normalised to one month, for MRR-style rollups. */
  monthlyEquivalent(subscription: SubscriptionEntity, plan: PlanEntity | undefined): number {
    if (!plan) return 0;
    return subscription.billingCycle === BillingCycle.YEARLY
      ? Math.round((plan.priceYearly / 12) * 100) / 100
      : plan.priceMonthly;
  }
}
