import { DocPageVersionEntity } from '../domain/entities/doc-page-version.entity';

/** Port for a page's saved versions. Append-only — there is no `update`. */
export abstract class IDocPageVersionRepository {
  findById: (id: string) => Promise<DocPageVersionEntity | null>;
  /** One page's history, newest first. */
  findByPage: (pageId: string) => Promise<DocPageVersionEntity[]>;
  save: (version: DocPageVersionEntity) => Promise<void>;
  /** Cascade for a deleted page — history without its page is unreachable. */
  deleteByPages: (pageIds: string[]) => Promise<void>;
  /** Cascade for a deleted doc. */
  deleteByDoc: (docId: string) => Promise<void>;
}
