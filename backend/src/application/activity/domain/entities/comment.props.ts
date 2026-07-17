import { UniqueEntityID } from '@core/domain';

export interface CommentProps {
  id: UniqueEntityID;
  tenantId: string;
  /** The bug this comment is on (empty for a task comment). */
  bugId: string;
  /** The task this comment is on (empty for a bug comment). */
  taskId: string;
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
