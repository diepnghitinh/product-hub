import { CommentEntity } from '../domain/entities/comment.entity';

/** Unresolved thread count for one doc page — what the rail badges. */
export interface DocPageCommentCount {
  pageId: string;
  openCount: number;
}

/** Port for issue, roadmap-item + doc-page comments. */
export abstract class ICommentRepository {
  /** Comments on an issue (bug or task), by the issue's shared id. */
  findByIssue: (tenantId: string, issueId: string) => Promise<CommentEntity[]>;
  findByRoadmapItem: (tenantId: string, roadmapItemId: string) => Promise<CommentEntity[]>;
  findByDocPage: (tenantId: string, docPageId: string) => Promise<CommentEntity[]>;
  /** Open (unresolved) top-level threads per page, for one doc's rail. */
  countOpenByDoc: (tenantId: string, docId: string) => Promise<DocPageCommentCount[]>;
  /** Drop every comment on the given pages — called when pages are deleted. */
  deleteByDocPages: (tenantId: string, docPageIds: string[]) => Promise<void>;
  /** Drop every comment in a doc — called when the whole doc is deleted. */
  deleteByDoc: (tenantId: string, docId: string) => Promise<void>;
  findById: (tenantId: string, id: string) => Promise<CommentEntity | null>;
  /** Recent comments that mention the given user (for the inbox). */
  findMentionsForUser: (
    tenantId: string,
    userId: string,
    limit: number,
  ) => Promise<CommentEntity[]>;
  append: (comment: CommentEntity) => Promise<void>;
  update: (comment: CommentEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}
