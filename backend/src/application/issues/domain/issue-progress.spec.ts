import { IssueKind } from './enums/issue.enums';
import { autoStatusFor, progressOf } from './issue-progress';

describe('progressOf', () => {
  it('reads a parent as its sub-tasks — 3 of 5 done is 60%', () => {
    expect(progressOf(IssueKind.TASK, 'in-progress', { total: 5, done: 3 })).toBe(60);
  });

  it('rounds to a whole percent (1 of 3 is 33, not 33.333…)', () => {
    expect(progressOf(IssueKind.TASK, 'todo', { total: 3, done: 1 })).toBe(33);
  });

  it('lets the children overrule a parent someone marked Done too early', () => {
    // The lie this feature exists to stop: the card said Done, two sub-tasks
    // were still open.
    expect(progressOf(IssueKind.TASK, 'done', { total: 5, done: 3 })).toBe(60);
  });

  it('falls back to the issue’s own status when it has no sub-tasks', () => {
    expect(progressOf(IssueKind.TASK, 'todo')).toBe(0);
    expect(progressOf(IssueKind.TASK, 'done')).toBe(100);
    expect(progressOf(IssueKind.TASK, 'in-progress', { total: 0, done: 0 })).toBe(0);
  });

  it('knows a bug finishes at resolved/closed, not at "done"', () => {
    expect(progressOf(IssueKind.BUG, 'resolved')).toBe(100);
    expect(progressOf(IssueKind.BUG, 'closed')).toBe(100);
    expect(progressOf(IssueKind.BUG, 'blocked')).toBe(0);
  });
});

describe('autoStatusFor', () => {
  it('moves a parent to Done when the last sub-task lands', () => {
    expect(autoStatusFor(IssueKind.TASK, 'in-progress', { total: 4, done: 4 })).toBe('done');
    expect(autoStatusFor(IssueKind.BUG, 'open', { total: 2, done: 2 })).toBe('resolved');
  });

  it('pulls a parent back out of Done when a sub-task reopens', () => {
    expect(autoStatusFor(IssueKind.TASK, 'done', { total: 4, done: 3 })).toBe('in-progress');
    expect(autoStatusFor(IssueKind.BUG, 'closed', { total: 2, done: 1 })).toBe('in-progress');
  });

  it('leaves a parent alone when it is already where it belongs', () => {
    expect(autoStatusFor(IssueKind.TASK, 'done', { total: 4, done: 4 })).toBeNull();
    expect(autoStatusFor(IssueKind.TASK, 'todo', { total: 4, done: 0 })).toBeNull();
    // A custom column mid-flight is a deliberate choice; only *finishing* the
    // work may move a card out of it.
    expect(autoStatusFor(IssueKind.TASK, 'in-review', { total: 4, done: 2 })).toBeNull();
  });

  it('never infers anything for a leaf — a hand-set status stays hand-set', () => {
    expect(autoStatusFor(IssueKind.TASK, 'done', { total: 0, done: 0 })).toBeNull();
    expect(autoStatusFor(IssueKind.TASK, 'todo', { total: 0, done: 0 })).toBeNull();
  });
});
