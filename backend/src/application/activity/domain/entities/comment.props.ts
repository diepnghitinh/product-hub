import { UniqueEntityID } from '@core/domain';

export interface CommentProps {
  id: UniqueEntityID;
  tenantId: string;
  /**
   * The issue (bug or task) this comment is on — the canonical subject id, equal
   * to the issue's shared `_id`. Empty for a roadmap-item comment.
   */
  issueId: string;
  /**
   * Legacy mirror of `issueId`, set only when the issue is a bug. Kept because the
   * inbox still resolves mentions by `bugId` and to keep the migration reversible.
   */
  bugId: string;
  /** Legacy mirror of `issueId`, set only when the issue is a task (reversibility). */
  taskId: string;
  /** The roadmap item this comment is on (empty for an issue comment). */
  roadmapItemId: string;
  /**
   * The top-level comment this one replies to (empty for a top-level comment).
   * A thread is only ever one level deep: a reply always points at a root, never
   * at another reply.
   */
  parentId: string;
  authorId: string;
  authorName: string;
  body: string;
  /** User ids @-mentioned in the body (drives the inbox). */
  mentions: string[];
  images: string[];
  createdAt: Date;
  /** Set to createdAt on creation; bumped whenever the body is edited. */
  updatedAt: Date;
}
