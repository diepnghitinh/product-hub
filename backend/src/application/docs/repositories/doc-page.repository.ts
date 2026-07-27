import { DocPageEntity } from '../domain/entities/doc-page.entity';

/** Port for doc-page persistence. Pages are always read through their doc. */
export abstract class IDocPageRepository {
  findById: (id: string) => Promise<DocPageEntity | null>;
  /** Every page of a doc, ordered by `order` — the flat tree the rail renders. */
  findByDoc: (docId: string) => Promise<DocPageEntity[]>;
  /** Pages attached to a record (issue / roadmap item), newest first. */
  findByLinkRef: (tenantId: string, refId: string) => Promise<DocPageEntity[]>;
  /** Page totals per doc id — the hub's card count, in one query. */
  countByDocIds: (docIds: string[]) => Promise<Record<string, number>>;
  save: (page: DocPageEntity) => Promise<void>;
  update: (page: DocPageEntity) => Promise<void>;
  updateMany: (pages: DocPageEntity[]) => Promise<void>;
  delete: (id: string) => Promise<void>;
  deleteMany: (ids: string[]) => Promise<void>;
  deleteByDoc: (docId: string) => Promise<void>;
}
