import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute, Role } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { PasswordService } from '@module-shared/services/password.service';
import { TenantEntity } from '@application/tenants/domain/entities/tenant.entity';
import { TenantStatus } from '@application/tenants/domain/entities/tenant.props';
import { ITenantRepository } from '@application/tenants/repositories/tenant.repository';
import { UserEntity } from '@application/users/domain/entities/user.entity';
import { QueryUserDto } from '@application/users/dtos/query-user.dto';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { EnsureDefaultTeamsUseCase } from '@application/teams/use-cases/team.use-cases';
import { SubscriptionEntity } from '../domain/entities/subscription.entity';
import { SubscriptionStatus } from '../domain/entities/subscription.props';
import {
  CreateTenantDto,
  PlatformOverviewDto,
  QueryTenantsDto,
  TenantDetailResponseDto,
  TenantListResponseDto,
  TenantResponseDto,
  UpdateTenantDto,
} from '../dtos/tenant.dtos';
import {
  EMPTY_USAGE,
  isOverAnyLimit,
  PlatformTenantMapper,
} from '../mappers/platform.mapper';
import { IPlanRepository } from '../repositories/plan.repository';
import { IPlatformUsageRepository } from '../repositories/platform-usage.repository';
import { ISubscriptionRepository } from '../repositories/subscription.repository';
import { EntitlementService } from '../services/entitlement.service';

/**
 * The tenants table.
 *
 * Joins three sources per page — the tenants, their subscriptions, and live
 * usage — but only for the ids on the page, so the cost stays flat as the
 * platform grows.
 */
@Injectable()
export class ListTenantsUseCase
  implements
    IUsecaseExecute<{ query: QueryTenantsDto }, Promise<Result<TenantListResponseDto>>>
{
  constructor(
    @Inject(ITenantRepository) private readonly tenants: ITenantRepository,
    @Inject(ISubscriptionRepository)
    private readonly subscriptions: ISubscriptionRepository,
    @Inject(IPlatformUsageRepository)
    private readonly usage: IPlatformUsageRepository,
    private readonly entitlements: EntitlementService,
  ) {}

  async execute({
    query,
  }: {
    query: QueryTenantsDto;
  }): Promise<Result<TenantListResponseDto>> {
    const page = await this.tenants.findAll({
      search: query.search,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });

    if (page.data.length === 0) {
      return Result.ok({ ...page, data: [] });
    }

    const ids = page.data.map((t) => t.id.toString());
    const [subs, usage, byCode] = await Promise.all([
      this.subscriptions.findManyByTenants(ids),
      this.usage.forTenants(ids),
      this.entitlements.index(),
    ]);
    const subByTenant = new Map(subs.map((s) => [s.tenantId, s]));

    const data: TenantResponseDto[] = page.data.map((tenant) => {
      const id = tenant.id.toString();
      const sub = subByTenant.get(id);
      return PlatformTenantMapper.toResponseDto(
        tenant,
        sub,
        sub ? byCode.get(sub.planCode) : undefined,
        usage[id] ?? EMPTY_USAGE,
      );
    });

    return Result.ok({ ...page, data });
  }
}

@Injectable()
export class GetTenantDetailUseCase
  implements IUsecaseExecute<{ id: string }, Promise<Result<TenantDetailResponseDto>>>
{
  constructor(
    @Inject(ITenantRepository) private readonly tenants: ITenantRepository,
    @Inject(ISubscriptionRepository)
    private readonly subscriptions: ISubscriptionRepository,
    @Inject(IPlatformUsageRepository)
    private readonly usage: IPlatformUsageRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    private readonly entitlements: EntitlementService,
  ) {}

  async execute({ id }: { id: string }): Promise<Result<TenantDetailResponseDto>> {
    const tenant = await this.tenants.findById(id);
    if (!tenant) return Result.fail('Tenant not found');

    const [subscription, usage, byCode, admins] = await Promise.all([
      this.subscriptions.findByTenant(id),
      this.usage.forTenant(id),
      this.entitlements.index(),
      this.users.findByTenant(
        id,
        Object.assign(new QueryUserDto(), { role: Role.ADMIN, page: 1, limit: 20 }),
      ),
    ]);

    const plan = subscription ? byCode.get(subscription.planCode) : undefined;
    const row = PlatformTenantMapper.toResponseDto(tenant, subscription ?? undefined, plan, usage);
    const entitlements = this.entitlements.effective(subscription, byCode);

    return Result.ok(
      PlatformTenantMapper.toDetailDto(
        row,
        usage,
        entitlements,
        admins.data.map((u) => u.email),
      ),
    );
  }
}

/**
 * Creates a workspace from the console.
 *
 * Same shape as self-serve registration — tenant, default teams, first admin —
 * because a workspace created here must be indistinguishable from one a customer
 * signed up for. The only addition is putting them straight onto a plan.
 */
@Injectable()
export class CreateTenantUseCase
  implements IUsecaseExecute<{ dto: CreateTenantDto }, Promise<Result<TenantResponseDto>>>
{
  constructor(
    @Inject(ITenantRepository) private readonly tenants: ITenantRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IPlanRepository) private readonly plans: IPlanRepository,
    @Inject(ISubscriptionRepository)
    private readonly subscriptions: ISubscriptionRepository,
    private readonly password: PasswordService,
    private readonly ensureTeams: EnsureDefaultTeamsUseCase,
  ) {}

  async execute({ dto }: { dto: CreateTenantDto }): Promise<Result<TenantResponseDto>> {
    const adminEmail = dto.adminEmail.trim().toLowerCase();
    if (await this.users.existsByEmail(adminEmail)) {
      return Result.fail('An account with this email already exists');
    }

    const slug = dto.slug?.trim().toLowerCase() || null;
    if (slug && (await this.tenants.existsBySlug(slug))) {
      return Result.fail(`The slug "${slug}" is already taken`);
    }

    // Fail before writing anything if the plan is bogus — a half-created
    // workspace is far worse than a rejected form.
    const planCode = dto.planCode?.trim().toLowerCase() || null;
    const plan = planCode ? await this.plans.findByCode(planCode) : null;
    if (planCode && !plan) return Result.fail(`Plan "${planCode}" does not exist`);

    const tenantResult = TenantEntity.create({
      name: dto.name,
      slug,
      contactEmail: dto.contactEmail ?? null,
      notes: dto.notes ?? null,
    });
    if (tenantResult.isFailure) return Result.fail(tenantResult.error as string);
    const tenant = tenantResult.getValue();
    await this.tenants.save(tenant);

    const tenantId = tenant.id.toString();
    await this.ensureTeams.execute({ tenantId });

    const userResult = UserEntity.create({
      tenantId,
      email: adminEmail,
      name: dto.adminName,
      passwordHash: await this.password.hash(dto.adminPassword),
      role: Role.ADMIN,
    });
    if (userResult.isFailure) return Result.fail(userResult.error as string);
    await this.users.save(userResult.getValue());

    let subscription: SubscriptionEntity | undefined;
    if (plan) {
      const subResult = SubscriptionEntity.create({
        tenantId,
        planCode: plan.code,
        status: SubscriptionStatus.ACTIVE,
      });
      if (subResult.isFailure) return Result.fail(subResult.error as string);
      subscription = subResult.getValue();
      await this.subscriptions.save(subscription);
    }

    return Result.ok(
      PlatformTenantMapper.toResponseDto(tenant, subscription, plan ?? undefined, {
        ...EMPTY_USAGE,
        users: 1,
      }),
    );
  }
}

@Injectable()
export class UpdateTenantUseCase
  implements
    IUsecaseExecute<
      { id: string; dto: UpdateTenantDto },
      Promise<Result<TenantResponseDto>>
    >
{
  constructor(
    @Inject(ITenantRepository) private readonly tenants: ITenantRepository,
    @Inject(ISubscriptionRepository)
    private readonly subscriptions: ISubscriptionRepository,
    @Inject(IPlanRepository) private readonly plans: IPlanRepository,
  ) {}

  async execute({
    id,
    dto,
  }: {
    id: string;
    dto: UpdateTenantDto;
  }): Promise<Result<TenantResponseDto>> {
    const tenant = await this.tenants.findById(id);
    if (!tenant) return Result.fail('Tenant not found');

    if (dto.slug) {
      const slug = dto.slug.trim().toLowerCase();
      if (await this.tenants.existsBySlug(slug, id)) {
        return Result.fail(`The slug "${slug}" is already taken`);
      }
    }

    const updated = tenant.update(dto);
    if (updated.isFailure) return Result.fail(updated.error as string);
    await this.tenants.save(tenant);

    const subscription = await this.subscriptions.findByTenant(id);
    const plan = subscription ? await this.plans.findByCode(subscription.planCode) : null;
    return Result.ok(
      PlatformTenantMapper.toResponseDto(
        tenant,
        subscription ?? undefined,
        plan ?? undefined,
      ),
    );
  }
}

/**
 * Suspends or reactivates a workspace.
 *
 * Suspension is enforced at login (see `LoginUseCase`), not by deleting data —
 * an account that pays up again gets everything back exactly as it was.
 */
@Injectable()
export class SetTenantStatusUseCase
  implements
    IUsecaseExecute<
      { id: string; status: TenantStatus },
      Promise<Result<TenantResponseDto>>
    >
{
  constructor(
    @Inject(ITenantRepository) private readonly tenants: ITenantRepository,
    @Inject(ISubscriptionRepository)
    private readonly subscriptions: ISubscriptionRepository,
    @Inject(IPlanRepository) private readonly plans: IPlanRepository,
  ) {}

  async execute({
    id,
    status,
  }: {
    id: string;
    status: TenantStatus;
  }): Promise<Result<TenantResponseDto>> {
    const tenant = await this.tenants.findById(id);
    if (!tenant) return Result.fail('Tenant not found');

    if (status === TenantStatus.SUSPENDED) tenant.suspend();
    else tenant.activate();
    await this.tenants.save(tenant);

    const subscription = await this.subscriptions.findByTenant(id);
    const plan = subscription ? await this.plans.findByCode(subscription.planCode) : null;
    return Result.ok(
      PlatformTenantMapper.toResponseDto(
        tenant,
        subscription ?? undefined,
        plan ?? undefined,
      ),
    );
  }
}

/** The console's landing numbers: how many workspaces, on what, worth how much. */
@Injectable()
export class GetPlatformOverviewUseCase
  implements IUsecaseExecute<void, Promise<Result<PlatformOverviewDto>>>
{
  constructor(
    @Inject(ITenantRepository) private readonly tenants: ITenantRepository,
    @Inject(ISubscriptionRepository)
    private readonly subscriptions: ISubscriptionRepository,
    @Inject(IPlatformUsageRepository)
    private readonly usage: IPlatformUsageRepository,
    private readonly entitlements: EntitlementService,
  ) {}

  async execute(): Promise<Result<PlatformOverviewDto>> {
    // `allIds` rather than the first page of `findAll`: these are whole-platform
    // numbers, and a rollup that quietly stopped at 200 workspaces would be
    // wrong in exactly the situation it matters.
    const [ids, suspended, subs, byCode] = await Promise.all([
      this.tenants.allIds(),
      this.tenants.findAll({ status: TenantStatus.SUSPENDED, page: 1, limit: 1 }),
      this.subscriptions.findAll(),
      this.entitlements.index(),
    ]);

    const usage = await this.usage.forTenants(ids);
    const subByTenant = new Map(subs.map((s) => [s.tenantId, s]));

    // MRR assumes a single-currency catalog — the console shows the currency
    // most of the priced plans use rather than pretending to convert.
    let mrr = 0;
    const currencies = new Map<string, number>();
    for (const sub of subs) {
      const plan = byCode.get(sub.planCode);
      if (!plan || sub.status !== SubscriptionStatus.ACTIVE) continue;
      mrr += this.entitlements.monthlyEquivalent(sub, plan);
      currencies.set(plan.currency, (currencies.get(plan.currency) ?? 0) + 1);
    }
    const currency =
      [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';

    let overLimit = 0;
    for (const id of ids) {
      const entitlements = this.entitlements.effective(subByTenant.get(id) ?? null, byCode);
      if (isOverAnyLimit(usage[id] ?? EMPTY_USAGE, entitlements)) overLimit += 1;
    }

    const count = (status: SubscriptionStatus): number =>
      subs.filter((s) => s.status === status).length;

    return Result.ok({
      tenantCount: ids.length,
      activeTenantCount: ids.length - suspended.total,
      suspendedTenantCount: suspended.total,
      userCount: ids.reduce((sum, id) => sum + (usage[id]?.users ?? 0), 0),
      subscribedTenantCount: count(SubscriptionStatus.ACTIVE),
      trialTenantCount: count(SubscriptionStatus.TRIAL),
      pastDueTenantCount: count(SubscriptionStatus.PAST_DUE),
      unassignedTenantCount: Math.max(0, ids.length - subs.length),
      mrr: Math.round(mrr * 100) / 100,
      currency,
      overLimitTenantCount: overLimit,
    });
  }
}
