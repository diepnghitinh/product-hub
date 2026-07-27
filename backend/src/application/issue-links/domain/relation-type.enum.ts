/**
 * How two same-type issues (task↔task or bug↔bug) relate. Stored directionally
 * source → target; the six values map 1:1 to the "Mark as" menu. A link viewed
 * from the *target* side is shown with its inverse (below), so one stored row
 * reads correctly from both issues ("blocked by" ⇄ "blocking").
 */
export enum RelationType {
  BLOCKS = 'blocks', // source is blocking target
  BLOCKED_BY = 'blocked_by', // source is blocked by target
  PARENT_OF = 'parent_of', // source is the parent of target
  SUB_ISSUE_OF = 'sub_issue_of', // source is a sub-issue of target
  RELATED_TO = 'related_to', // symmetric
  DUPLICATE_OF = 'duplicate_of', // symmetric (its own inverse)
}

/** The same link as read from the *other* endpoint. */
export const INVERSE_RELATION: Record<RelationType, RelationType> = {
  [RelationType.BLOCKS]: RelationType.BLOCKED_BY,
  [RelationType.BLOCKED_BY]: RelationType.BLOCKS,
  [RelationType.PARENT_OF]: RelationType.SUB_ISSUE_OF,
  [RelationType.SUB_ISSUE_OF]: RelationType.PARENT_OF,
  [RelationType.RELATED_TO]: RelationType.RELATED_TO,
  [RelationType.DUPLICATE_OF]: RelationType.DUPLICATE_OF,
};

/**
 * A kind of issue. Stored on a link as `issueType` = the *source* end's kind; the
 * two ends may differ (a bug can block a task), so the other end's kind is resolved
 * on read and returned as `targetKind`. Mirrors the frontend `IssueKind`.
 */
export enum IssueKind {
  Task = 'task',
  Bug = 'bug',
}
