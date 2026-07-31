import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ITenantRepository } from '@application/tenants/repositories/tenant.repository';
import { SubscriptionEntity } from '../domain/entities/subscription.entity';
import { SubscriptionStatus } from '../domain/entities/subscription.props';
import {
  SubscriptionResponseDto,
  UpsertSubscriptionDto,
} from '../dtos/subscription.dtos';
import { SubscriptionMapper } from '../mappers/platform.mapper';
import { IPlanRepository } from '../repositories/plan.repository';
import { ISubscriptionRepository } from '../repositories/subscription.repository';
import { EntitlementService } from '../services/entitlement.service';

const toDate = (value?: string | null): Date | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

@Injectable()
export class ListSubscriptionsUseCase
  implements IUsecaseExecute<void, Promise<Result<SubscriptionResponseDto[]>>>
{
  constructor(
    @Inject(ISubscriptionRepository)
    private readonly subscriptions: ISubscriptionRepository,
    @Inject(ITenantRepository) private readonly tenants: ITenantRepository,
    private readonly entitlements: EntitlementService,
  ) {}

  async execute(): Promise<Result<SubscriptionResponseDto[]>> {
    const all = await this.subscriptions.findAll();
    if (all.length === 0) return Result.ok([]);

    const byCode = await this.entitlements.index();
    const tenants = await this.tenants.findManyByIds(all.map((s) => s.tenantId));
    const tenantById = new Map(tenants.map((t) => [t.id.toString(), t]));

    const rows = all.map((s) => {
      const plan = byCode.get(s.planCode);
      return SubscriptionMapper.toResponseDto(
        s,
        tenantById.get(s.tenantId),
        plan,
        this.entitlements.monthlyEquivalent(s, plan),
      );
    });
    rows.sort((a, b) => a.tenantName.localeCompare(b.tenantName));
    return Result.ok(rows);
  }
}

@Injectable()
export class GetTenantSubscriptionUseCase
  implements
    IUsecaseExecute<{ tenantId: string }, Promise<Result<SubscriptionResponseDto | null>>>
{
  constructor(
    @Inject(ISubscriptionRepository)
    private readonly subscriptions: ISubscriptionRepository,
    @Inject(ITenantRepository) private readonly tenants: ITenantRepository,
    @Inject(IPlanRepository) private readonly plans: IPlanRepository,
    private readonly entitlements: EntitlementService,
  ) {}

  async execute({
    tenantId,
  }: {
    tenantId: string;
  }): Promise<Result<SubscriptionResponseDto | null>> {
    const subscription = await this.subscriptions.findByTenant(tenantId);
    // Not an error: a tenant without a plan is a normal state the console shows
    // as "No plan", and the caller shouldn't have to distinguish it from a 404.
    if (!subscription) return Result.ok(null);

    const tenant = await this.tenants.findById(tenantId);
    const plan = await this.plans.findByCode(subscription.planCode);
    return Result.ok(
      SubscriptionMapper.toResponseDto(
        subscription,
        tenant ?? undefined,
        plan ?? undefined,
        this.entitlements.monthlyEquivalent(subscription, plan ?? undefined),
      ),
    );
  }
}

/**
 * Puts a tenant on a plan.
 *
 * An upsert rather than create/update: one subscription per tenant is the model,
 * so "assign Pro" is a single idempotent call whatever the tenant was on before.
 */
@Injectable()
export class UpsertSubscriptionUseCase
  implements
    IUsecaseExecute<
      { tenantId: string; dto: UpsertSubscriptionDto },
      Promise<Result<SubscriptionResponseDto>>
    >
{
  constructor(
    @Inject(ISubscriptionRepository)
    private readonly subscriptions: ISubscriptionRepository,
    @Inject(ITenantRepository) private readonly tenants: ITenantRepository,
    @Inject(IPlanRepository) private readonly plans: IPlanRepository,
    private readonly entitlements: EntitlementService,
  ) {}

  async execute({
    tenantId,
    dto,
  }: {
    tenantId: string;
    dto: UpsertSubscriptionDto;
  }): Promise<Result<SubscriptionResponseDto>> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) return Result.fail('Tenant not found');

    const planCode = dto.planCode.trim().toLowerCase();
    const plan = await this.plans.findByCode(planCode);
    if (!plan) return Result.fail(`Plan "${planCode}" does not exist`);

    const existing = await this.subscriptions.findByTenant(tenantId);
    let subscription: SubscriptionEntity;

    if (existing) {
      const updated = existing.update({
        planCode,
        status: dto.status,
        billingCycle: dto.billingCycle,
        currentPeriodEnd: toDate(dto.currentPeriodEnd),
        cancelAt: toDate(dto.cancelAt),
        featureOverrides: dto.featureOverrides,
        notes: dto.notes,
      });
      if (updated.isFailure) return Result.fail(updated.error as string);
      subscription = existing;
    } else {
      const created = SubscriptionEntity.create({
        tenantId,
        planCode,
        status: dto.status,
        billingCycle: dto.billingCycle,
        currentPeriodEnd: toDate(dto.currentPeriodEnd) ?? null,
        cancelAt: toDate(dto.cancelAt) ?? null,
        featureOverrides: dto.featureOverrides,
        notes: dto.notes,
      });
      if (created.isFailure) return Result.fail(created.error as string);
      subscription = created.getValue();
    }

    await this.subscriptions.save(subscription);
    return Result.ok(
      SubscriptionMapper.toResponseDto(
        subscription,
        tenant,
        plan,
        this.entitlements.monthlyEquivalent(subscription, plan),
      ),
    );
  }
}

/**
 * Marks a subscription canceled without deleting it — the tenant's billing
 * history is the record of what they were on, and a delete would erase it.
 */
@Injectable()
export class CancelSubscriptionUseCase
  implements
    IUsecaseExecute<{ tenantId: string }, Promise<Result<SubscriptionResponseDto>>>
{
  constructor(
    @Inject(ISubscriptionRepository)
    private readonly subscriptions: ISubscriptionRepository,
    @Inject(ITenantRepository) private readonly tenants: ITenantRepository,
    @Inject(IPlanRepository) private readonly plans: IPlanRepository,
    private readonly entitlements: EntitlementService,
  ) {}

  async execute({
    tenantId,
  }: {
    tenantId: string;
  }): Promise<Result<SubscriptionResponseDto>> {
    const subscription = await this.subscriptions.findByTenant(tenantId);
    if (!subscription) return Result.fail('This tenant has no subscription');

    const updated = subscription.update({
      status: SubscriptionStatus.CANCELED,
      cancelAt: new Date(),
    });
    if (updated.isFailure) return Result.fail(updated.error as string);
    await this.subscriptions.save(subscription);

    const tenant = await this.tenants.findById(tenantId);
    const plan = await this.plans.findByCode(subscription.planCode);
    return Result.ok(
      SubscriptionMapper.toResponseDto(
        subscription,
        tenant ?? undefined,
        plan ?? undefined,
        this.entitlements.monthlyEquivalent(subscription, plan ?? undefined),
      ),
    );
  }
}

/** Takes a tenant off plans entirely — back to the "No plan" state. */
@Injectable()
export class RemoveSubscriptionUseCase
  implements IUsecaseExecute<{ tenantId: string }, Promise<Result<void>>>
{
  constructor(
    @Inject(ISubscriptionRepository)
    private readonly subscriptions: ISubscriptionRepository,
  ) {}

  async execute({ tenantId }: { tenantId: string }): Promise<Result<void>> {
    await this.subscriptions.deleteByTenant(tenantId);
    return Result.ok();
  }
}
