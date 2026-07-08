import { RoadmapEntity } from '../domain/entities/roadmap.entity';

/** Port for roadmap persistence. Tenant-scoped. */
export abstract class IRoadmapRepository {
  findById: (id: string) => Promise<RoadmapEntity | null>;
  findByTenant: (tenantId: string) => Promise<RoadmapEntity[]>;
  save: (roadmap: RoadmapEntity) => Promise<void>;
  update: (roadmap: RoadmapEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}
