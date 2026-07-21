import { UniqueEntityID } from '@core/domain';

export interface CommentProps {
  id: UniqueEntityID;
  tenantId: string;
  /** The bug this comment is on (empty for a task/roadmap-item comment). */
  bugId: string;
  /** The task this comment is on (empty for a bug/roadmap-item comment). */
  taskId: string;
  /** The roadmap item this comment is on (empty for a bug/task comment). */
  roadmapItemId: string;
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
