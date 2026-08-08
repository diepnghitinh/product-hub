import { DocEntity } from '../domain/entities/doc.entity';

/**
 * Who is asking. Every doc read carries one, because a private doc is only a doc
 * for its author and for admins — see `DocEntity.isVisibleTo`.
 */
export interface DocViewer {
  userId: string;
  isAdmin: boolean;
}

/** Port for doc (container) persistence. Tenant-scoped. */
export abstract class IDocRepository {
  findById: (id: string) => Promise<DocEntity | null>;
  /** Resolve whatever the URL carried: a `DOC-6HCUHKX` ref or the uuid. Both,
   *  because refs are new and links sent before they existed still point at ids. */
  findByIdOrRef: (tenantId: string, idOrRef: string) => Promise<DocEntity | null>;
  /** Is this ref already taken in this tenant? (ref-minting collision check) */
  refExists: (tenantId: string, ref: string) => Promise<boolean>;
  findByPublicToken: (token: string) => Promise<DocEntity | null>;
  /**
   * The hub list. `viewer` is not optional on purpose: this is the one query that
   * returns docs nobody named, so leaving the filter to the caller is exactly how
   * a private doc ends up on somebody else's screen. Omitting a viewer entirely
   * (a script, a backfill) is spelled `null`, so it reads as a decision.
   */
  findByTenant: (tenantId: string, viewer: DocViewer | null) => Promise<DocEntity[]>;
  save: (doc: DocEntity) => Promise<void>;
  update: (doc: DocEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}
