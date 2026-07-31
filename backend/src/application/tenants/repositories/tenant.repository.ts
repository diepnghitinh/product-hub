import { TenantEntity } from '../domain/entities/tenant.entity';

export interface TenantListQuery {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface TenantPage {
  data: TenantEntity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Port for tenant persistence (implemented in infrastructure). */
export abstract class ITenantRepository {
  findById: (id: string) => Promise<TenantEntity | null>;
  findManyByIds: (ids: string[]) => Promise<TenantEntity[]>;
  /** Platform-console listing — the one place that reads across tenants. */
  findAll: (query: TenantListQuery) => Promise<TenantPage>;
  existsBySlug: (slug: string, excludeId?: string) => Promise<boolean>;
  countAll: () => Promise<number>;
  /** Every tenant id — drives one-off backfills. */
  allIds: () => Promise<string[]>;
  save: (tenant: TenantEntity) => Promise<void>;
}
