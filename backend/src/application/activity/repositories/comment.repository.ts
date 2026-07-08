import { CommentEntity } from '../domain/entities/comment.entity';

/** Port for bug comments. */
export abstract class ICommentRepository {
  findByBug: (tenantId: string, bugId: string) => Promise<CommentEntity[]>;
  /** Recent comments that mention the given user (for the inbox). */
  findMentionsForUser: (
    tenantId: string,
    userId: string,
    limit: number,
  ) => Promise<CommentEntity[]>;
  append: (comment: CommentEntity) => Promise<void>;
}
