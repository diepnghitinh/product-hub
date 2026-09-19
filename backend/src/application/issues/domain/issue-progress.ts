import { BugStatus, IssueKind, TaskStatus, isCompletedStatus } from './enums/issue.enums';

/**
 * How far along an issue is — **derived, never stored**.
 *
 * A parent's percentage is its sub-tasks': "3 of 5 done" is 60%, and it moves
 * the moment a child moves. Storing a counter on the parent would mean two
 * writes per child transition and a number that drifts the first time one of
 * them is missed (a delete, a re-parent, a direct DB fix). Computing it on read
 * costs one extra aggregation per list page and cannot be wrong.
 *
 * An issue with no children still has a progress — 0 while it is open, 100 once
 * it reaches a done status — so a card renders the same bar either way and a
 * caller never has to special-case "leaf".
 */
export interface ChildRollup {
  /** Sub-tasks this issue has, whatever their status. */
  total: number;
  /** How many of them sit in a completed status for their own kind. */
  done: number;
}

/** No children — the shape a leaf rolls up to. */
export const EMPTY_ROLLUP: ChildRollup = { total: 0, done: 0 };

/**
 * Percent complete, 0–100 (integer).
 *
 * Children win when there are any: a parent marked Done by hand while two
 * sub-tasks are still open is *not* finished, and the bar should say so — the
 * same reading `SubtaskSection` has always shown on the detail page.
 */
export function progressOf(kind: IssueKind, status: string, rollup?: ChildRollup | null): number {
  if (rollup && rollup.total > 0) {
    return Math.round((rollup.done / rollup.total) * 100);
  }
  return isCompletedStatus(kind, status) ? 100 : 0;
}

/**
 * Where a parent lands when its children finish, and where it falls back to when
 * one of them reopens.
 *
 * Both are **built-in** keys, which is what makes this safe to apply without
 * reading the team: a team may rename, recolour and reorder its columns but can
 * never remove a built-in one (`builtinStatusKeys`), so these always name a
 * column that exists on whatever board the parent is on. A custom column can
 * never be auto-chosen — the roll-up only ever moves a parent *between* the two
 * built-ins below.
 */
const AUTO_DONE_KEY: Record<IssueKind, string> = {
  [IssueKind.TASK]: TaskStatus.DONE,
  [IssueKind.BUG]: BugStatus.RESOLVED,
};
const AUTO_REOPEN_KEY: Record<IssueKind, string> = {
  [IssueKind.TASK]: TaskStatus.IN_PROGRESS,
  [IssueKind.BUG]: BugStatus.IN_PROGRESS,
};

/**
 * The status a parent should be in given its children — Evelyn's ask: finishing
 * the last sub-task moves the parent to Done on its own, so nobody has to drag a
 * card that the work already answered for. Reopening a child moves it back out,
 * because a parent sitting in Done over unfinished work is the same lie in
 * reverse.
 *
 * Returns `null` when the parent is already where it belongs — including the
 * "no children" case, where nothing can be inferred and a hand-set status must
 * be left exactly as the person set it.
 */
export function autoStatusFor(
  kind: IssueKind,
  status: string,
  rollup: ChildRollup,
): string | null {
  if (rollup.total === 0) return null;
  const allDone = rollup.done === rollup.total;
  const isDone = isCompletedStatus(kind, status);
  if (allDone && !isDone) return AUTO_DONE_KEY[kind];
  if (!allDone && isDone) return AUTO_REOPEN_KEY[kind];
  return null;
}
