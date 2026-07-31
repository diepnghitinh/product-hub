import { PlanEntity } from '../domain/entities/plan.entity';

/** Port for the plan catalog (implemented in infrastructure). */
export abstract class IPlanRepository {
  findById: (id: string) => Promise<PlanEntity | null>;
  findByCode: (code: string) => Promise<PlanEntity | null>;
  findAll: () => Promise<PlanEntity[]>;
  /** True when any *other* plan already uses this code. */
  existsByCode: (code: string, excludeId?: string) => Promise<boolean>;
  /** Plans that inherit from `code` — a delete has to refuse while any exist. */
  findExtending: (code: string) => Promise<PlanEntity[]>;
  save: (plan: PlanEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}
