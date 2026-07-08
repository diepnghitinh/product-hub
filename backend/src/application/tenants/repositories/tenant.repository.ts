import { TenantEntity } from '../domain/entities/tenant.entity';

/** Port for tenant persistence (implemented in infrastructure). */
export abstract class ITenantRepository {
  findById: (id: string) => Promise<TenantEntity | null>;
  save: (tenant: TenantEntity) => Promise<void>;
}
