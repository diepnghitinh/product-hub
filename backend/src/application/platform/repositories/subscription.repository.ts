import { SubscriptionEntity } from '../domain/entities/subscription.entity';

/** Port for tenant subscriptions (implemented in infrastructure). */
export abstract class ISubscriptionRepository {
  findByTenant: (tenantId: string) => Promise<SubscriptionEntity | null>;
  findManyByTenants: (tenantIds: string[]) => Promise<SubscriptionEntity[]>;
  findAll: () => Promise<SubscriptionEntity[]>;
  /** How many tenants sit on a plan — a delete has to refuse while any do. */
  countByPlan: (planCode: string) => Promise<number>;
  save: (subscription: SubscriptionEntity) => Promise<void>;
  deleteByTenant: (tenantId: string) => Promise<void>;
}
