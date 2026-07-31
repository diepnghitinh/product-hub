import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { FeatureMap } from '../features';
import {
  BILLING_CYCLES,
  BillingCycle,
  SUBSCRIPTION_STATUSES,
  SubscriptionProps,
  SubscriptionStatus,
} from './subscription.props';

/**
 * What one tenant is entitled to: a plan, plus any per-tenant overrides on top.
 *
 * There is exactly one per tenant. A tenant with no subscription row isn't
 * broken — it simply has no plan yet, which the console shows as "No plan".
 */
export class SubscriptionEntity extends AggregateRoot<SubscriptionProps> {
  private constructor(props: SubscriptionProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      planCode: string;
      status?: SubscriptionStatus;
      billingCycle?: BillingCycle;
      currentPeriodEnd?: Date | null;
      cancelAt?: Date | null;
      featureOverrides?: FeatureMap;
      notes?: string | null;
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<SubscriptionEntity> {
    const guard = Guard.againstNullOrUndefinedBulk([
      { argument: props.tenantId, argumentName: 'tenantId' },
      { argument: props.planCode, argumentName: 'planCode' },
    ]);
    if (!guard.succeeded) return Result.fail(guard.message);

    const status = props.status ?? SubscriptionStatus.ACTIVE;
    const statusGuard = Guard.isOneOf(status, SUBSCRIPTION_STATUSES, 'status');
    if (!statusGuard.succeeded) return Result.fail(statusGuard.message);

    const cycle = props.billingCycle ?? BillingCycle.MONTHLY;
    const cycleGuard = Guard.isOneOf(cycle, BILLING_CYCLES, 'billingCycle');
    if (!cycleGuard.succeeded) return Result.fail(cycleGuard.message);

    const now = new Date();
    return Result.ok(
      new SubscriptionEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          planCode: props.planCode.trim().toLowerCase(),
          status,
          billingCycle: cycle,
          currentPeriodEnd: props.currentPeriodEnd ?? null,
          cancelAt: props.cancelAt ?? null,
          featureOverrides: props.featureOverrides ?? {},
          notes: props.notes?.trim() || null,
          createdAt: props.createdAt || now,
          updatedAt: props.updatedAt || now,
        },
        id,
      ),
    );
  }

  get id(): UniqueEntityID {
    return this._id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get planCode(): string {
    return this.props.planCode;
  }
  get status(): SubscriptionStatus {
    return this.props.status;
  }
  get billingCycle(): BillingCycle {
    return this.props.billingCycle;
  }
  get currentPeriodEnd(): Date | null {
    return this.props.currentPeriodEnd ?? null;
  }
  get cancelAt(): Date | null {
    return this.props.cancelAt ?? null;
  }
  get featureOverrides(): FeatureMap {
    return this.props.featureOverrides;
  }
  get notes(): string | null {
    return this.props.notes ?? null;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  update(patch: {
    planCode?: string;
    status?: SubscriptionStatus;
    billingCycle?: BillingCycle;
    currentPeriodEnd?: Date | null;
    cancelAt?: Date | null;
    featureOverrides?: FeatureMap;
    notes?: string | null;
  }): Result<void> {
    if (patch.planCode !== undefined) {
      const guard = Guard.againstEmptyString(patch.planCode, 'planCode');
      if (!guard.succeeded) return Result.fail(guard.message);
      this.props.planCode = patch.planCode.trim().toLowerCase();
    }
    if (patch.status !== undefined) {
      const guard = Guard.isOneOf(patch.status, SUBSCRIPTION_STATUSES, 'status');
      if (!guard.succeeded) return Result.fail(guard.message);
      this.props.status = patch.status;
    }
    if (patch.billingCycle !== undefined) {
      const guard = Guard.isOneOf(patch.billingCycle, BILLING_CYCLES, 'billingCycle');
      if (!guard.succeeded) return Result.fail(guard.message);
      this.props.billingCycle = patch.billingCycle;
    }
    if (patch.currentPeriodEnd !== undefined) {
      this.props.currentPeriodEnd = patch.currentPeriodEnd;
    }
    if (patch.cancelAt !== undefined) {
      this.props.cancelAt = patch.cancelAt;
    }
    if (patch.featureOverrides !== undefined) {
      this.props.featureOverrides = patch.featureOverrides;
    }
    if (patch.notes !== undefined) {
      this.props.notes = patch.notes?.trim() || null;
    }
    this.props.updatedAt = new Date();
    return Result.ok();
  }
}
