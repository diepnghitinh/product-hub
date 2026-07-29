import { DocEntity } from '../domain/entities/doc.entity';

/** Port for doc (container) persistence. Tenant-scoped. */
export abstract class IDocRepository {
  findById: (id: string) => Promise<DocEntity | null>;
  /** Resolve whatever the URL carried: a `DOC-6HCUHKX` ref or the uuid. Both,
   *  because refs are new and links sent before they existed still point at ids. */
  findByIdOrRef: (tenantId: string, idOrRef: string) => Promise<DocEntity | null>;
  /** Is this ref already taken in this tenant? (ref-minting collision check) */
  refExists: (tenantId: string, ref: string) => Promise<boolean>;
  findByPublicToken: (token: string) => Promise<DocEntity | null>;
  findByTenant: (tenantId: string) => Promise<DocEntity[]>;
  save: (doc: DocEntity) => Promise<void>;
  update: (doc: DocEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}
