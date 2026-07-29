/** What surfaced an inbox item. (Milestone assignments arrive in Phase 4.) */
export enum InboxKind {
  MENTION = 'mention',
  ASSIGNED_BUG = 'assigned-bug',
  /**
   * Mentioned in a comment on a doc page. Kept apart from `MENTION` because the
   * two open differently: a bug mention renders its bug in the inbox's own detail
   * pane, whereas a doc mention navigates to the page with the thread focused —
   * a doc page is a document, not something to inline in a 360px column.
   */
  DOC_MENTION = 'doc-mention',
}
