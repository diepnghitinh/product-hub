import { TenantEntity } from '../domain/entities/tenant.entity';

/** Port for tenant persistence (implemented in infrastructure). */
export abstract class ITenantRepository {
  findById: (id: string) => Promise<TenantEntity | null>;
  /** Every tenant id — drives one-off backfills. */
  allIds: () => Promise<string[]>;
  save: (tenant: TenantEntity) => Promise<void>;
}
