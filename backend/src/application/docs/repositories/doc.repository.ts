import { DocEntity } from '../domain/entities/doc.entity';

/** Port for doc (container) persistence. Tenant-scoped. */
export abstract class IDocRepository {
  findById: (id: string) => Promise<DocEntity | null>;
  findByPublicToken: (token: string) => Promise<DocEntity | null>;
  findByTenant: (tenantId: string) => Promise<DocEntity[]>;
  save: (doc: DocEntity) => Promise<void>;
  update: (doc: DocEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}
