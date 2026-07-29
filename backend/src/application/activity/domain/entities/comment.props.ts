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
  /** The doc that owns `docPageId` — carried so a doc's per-page counts are one
   *  query. Empty unless this is a doc-page comment. */
  docId: string;
  /** The doc page this comment is on (empty for an issue / roadmap-item comment). */
  docPageId: string;
  /**
   * The passage the comment points at, as a text quote: the selected text plus a
   * few words either side. Anchoring by quote rather than by position is what
   * lets a highlight survive the page being edited around it — and what lets a
   * comment go *orphaned*, honestly, once its text is deleted, instead of sliding
   * onto whatever sentence now occupies those offsets. Empty on a page-level
   * comment (one written without a selection).
   */
  anchorExact: string;
  anchorPrefix: string;
  anchorSuffix: string;
  /** Plain-text offset of the quote when it was written. Only a tie-breaker: it
   *  picks the nearest match when the same phrase appears several times. */
  anchorStart: number;
  /** A resolved thread keeps its highlight off the page and files under
   *  "Resolved". Set on the root; a reply follows its root. */
  resolved: boolean;
  resolvedById: string;
  resolvedByName: string;
  resolvedAt: Date | null;
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
