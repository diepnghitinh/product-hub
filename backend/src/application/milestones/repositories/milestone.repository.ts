import { MilestoneEntity } from '../domain/milestone.entity';

/** Port for milestone persistence. Tenant-scoped. */
export abstract class IMilestoneRepository {
  findById: (id: string) => Promise<MilestoneEntity | null>;
  findByTenant: (tenantId: string) => Promise<MilestoneEntity[]>;
  save: (milestone: MilestoneEntity) => Promise<void>;
  update: (milestone: MilestoneEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}
