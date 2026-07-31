import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { PlanEntity } from '../domain/entities/plan.entity';
import { CreatePlanDto, PlanResponseDto, UpdatePlanDto } from '../dtos/plan.dtos';
import { PlanMapper } from '../mappers/platform.mapper';
import { IPlanRepository } from '../repositories/plan.repository';
import { ISubscriptionRepository } from '../repositories/subscription.repository';
import { EntitlementService } from '../services/entitlement.service';

/** Subscribers per plan code, from one pass over the subscriptions. */
async function subscriberCounts(
  subscriptions: ISubscriptionRepository,
): Promise<Map<string, number>> {
  const all = await subscriptions.findAll();
  const counts = new Map<string, number>();
  for (const s of all) counts.set(s.planCode, (counts.get(s.planCode) ?? 0) + 1);
  return counts;
}

@Injectable()
export class ListPlansUseCase
  implements IUsecaseExecute<void, Promise<Result<PlanResponseDto[]>>>
{
  constructor(
    @Inject(IPlanRepository) private readonly plans: IPlanRepository,
    @Inject(ISubscriptionRepository)
    private readonly subscriptions: ISubscriptionRepository,
    private readonly entitlements: EntitlementService,
  ) {}

  async execute(): Promise<Result<PlanResponseDto[]>> {
    const all = await this.plans.findAll();
    const byCode = new Map(all.map((p) => [p.code, p]));
    const counts = await subscriberCounts(this.subscriptions);

    const rows = all
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((plan) =>
        PlanMapper.toResponseDto(
          plan,
          this.entitlements.resolve(plan, byCode),
          counts.get(plan.code) ?? 0,
        ),
      );
    return Result.ok(rows);
  }
}

@Injectable()
export class GetPlanUseCase
  implements IUsecaseExecute<{ id: string }, Promise<Result<PlanResponseDto>>>
{
  constructor(
    @Inject(IPlanRepository) private readonly plans: IPlanRepository,
    @Inject(ISubscriptionRepository)
    private readonly subscriptions: ISubscriptionRepository,
    private readonly entitlements: EntitlementService,
  ) {}

  async execute({ id }: { id: string }): Promise<Result<PlanResponseDto>> {
    // Accept either identifier: the console links by id, humans type the code.
    const plan = (await this.plans.findById(id)) ?? (await this.plans.findByCode(id));
    if (!plan) return Result.fail('Plan not found');

    const byCode = await this.entitlements.index();
    const count = await this.subscriptions.countByPlan(plan.code);
    return Result.ok(
      PlanMapper.toResponseDto(plan, this.entitlements.resolve(plan, byCode), count),
    );
  }
}

@Injectable()
export class CreatePlanUseCase
  implements IUsecaseExecute<{ dto: CreatePlanDto }, Promise<Result<PlanResponseDto>>>
{
  constructor(
    @Inject(IPlanRepository) private readonly plans: IPlanRepository,
    private readonly entitlements: EntitlementService,
  ) {}

  async execute({ dto }: { dto: CreatePlanDto }): Promise<Result<PlanResponseDto>> {
    const code = dto.code.trim().toLowerCase();
    if (await this.plans.existsByCode(code)) {
      return Result.fail(`A plan with code "${code}" already exists`);
    }

    const base = dto.extendsCode?.trim().toLowerCase() || null;
    if (base && !(await this.plans.findByCode(base))) {
      return Result.fail(`Base plan "${base}" does not exist`);
    }

    const result = PlanEntity.create({ ...dto, code, extendsCode: base });
    if (result.isFailure) return Result.fail(result.error as string);

    const plan = result.getValue();
    await this.plans.save(plan);

    const byCode = await this.entitlements.index();
    return Result.ok(
      PlanMapper.toResponseDto(plan, this.entitlements.resolve(plan, byCode), 0),
    );
  }
}

@Injectable()
export class UpdatePlanUseCase
  implements
    IUsecaseExecute<{ id: string; dto: UpdatePlanDto }, Promise<Result<PlanResponseDto>>>
{
  constructor(
    @Inject(IPlanRepository) private readonly plans: IPlanRepository,
    @Inject(ISubscriptionRepository)
    private readonly subscriptions: ISubscriptionRepository,
    private readonly entitlements: EntitlementService,
  ) {}

  async execute({
    id,
    dto,
  }: {
    id: string;
    dto: UpdatePlanDto;
  }): Promise<Result<PlanResponseDto>> {
    const plan = await this.plans.findById(id);
    if (!plan) return Result.fail('Plan not found');

    const byCode = await this.entitlements.index();

    if (dto.extendsCode !== undefined) {
      const base = dto.extendsCode?.trim().toLowerCase() || null;
      if (base && !byCode.has(base)) return Result.fail(`Base plan "${base}" does not exist`);
      // Refuse a loop up front: `resolve` would truncate silently, and the
      // operator would be left wondering why inheritance stopped working.
      if (this.entitlements.wouldCycle(plan.code, base, byCode)) {
        return Result.fail('That would make the plan inherit from itself');
      }
    }

    const updated = plan.update(dto);
    if (updated.isFailure) return Result.fail(updated.error as string);
    await this.plans.save(plan);

    byCode.set(plan.code, plan);
    const count = await this.subscriptions.countByPlan(plan.code);
    return Result.ok(
      PlanMapper.toResponseDto(plan, this.entitlements.resolve(plan, byCode), count),
    );
  }
}

@Injectable()
export class DeletePlanUseCase
  implements IUsecaseExecute<{ id: string }, Promise<Result<void>>>
{
  constructor(
    @Inject(IPlanRepository) private readonly plans: IPlanRepository,
    @Inject(ISubscriptionRepository)
    private readonly subscriptions: ISubscriptionRepository,
  ) {}

  async execute({ id }: { id: string }): Promise<Result<void>> {
    const plan = await this.plans.findById(id);
    if (!plan) return Result.fail('Plan not found');

    // Both refusals protect a live read: subscriptions resolve entitlements
    // through the plan code, and child plans through `extendsCode`. Deleting
    // either target wouldn't error anywhere — it would quietly zero out grants.
    const subscribers = await this.subscriptions.countByPlan(plan.code);
    if (subscribers > 0) {
      return Result.fail(
        `${subscribers} tenant${subscribers === 1 ? '' : 's'} still on this plan — move them first`,
      );
    }

    const children = await this.plans.findExtending(plan.code);
    if (children.length > 0) {
      return Result.fail(
        `${children.map((c) => c.name).join(', ')} inherit${children.length === 1 ? 's' : ''} from this plan`,
      );
    }

    await this.plans.delete(plan.id.toString());
    return Result.ok();
  }
}
