import { CommentEntity } from '../domain/entities/comment.entity';

/** Port for issue + roadmap-item comments. */
export abstract class ICommentRepository {
  /** Comments on an issue (bug or task), by the issue's shared id. */
  findByIssue: (tenantId: string, issueId: string) => Promise<CommentEntity[]>;
  findByRoadmapItem: (tenantId: string, roadmapItemId: string) => Promise<CommentEntity[]>;
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
