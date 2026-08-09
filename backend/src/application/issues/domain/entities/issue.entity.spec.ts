import { IssueEntity } from './issue.entity';
import { BugStatus, IssueKind, TaskStatus } from '../enums/issue.enums';

const makeIssue = (over: Partial<Parameters<typeof IssueEntity.create>[0]> = {}) =>
  IssueEntity.create({
    kind: IssueKind.TASK,
    tenantId: 't1',
    title: 'Fix login redirect',
    createdBy: 'u1',
    ...over,
  }).getValue();

describe('IssueEntity carryOverCount', () => {
  it('defaults to 0 for a freshly created issue', () => {
    expect(makeIssue().carryOverCount).toBe(0);
  });

  it('preserves a carry count rehydrated from the store', () => {
    // toDomain passes the stored value straight through — a rolled-over issue
    // must keep its count when it is read back.
    expect(makeIssue({ carryOverCount: 3 }).carryOverCount).toBe(3);
  });

  it('resets the carry count when the cycle is set manually', () => {
    // A manual placement is a deliberate fresh commitment; only the scheduler's
    // boundary sweep accrues the count, so setCycle clears it.
    const issue = makeIssue({ cycleId: 'c1', carryOverCount: 2 });
    issue.setCycle('c2');
    expect(issue.cycleId).toBe('c2');
    expect(issue.carryOverCount).toBe(0);
  });

  it('resets the carry count when the issue leaves its cycle', () => {
    const issue = makeIssue({ cycleId: 'c1', carryOverCount: 2 });
    issue.setCycle('');
    expect(issue.cycleId).toBe('');
    expect(issue.carryOverCount).toBe(0);
  });
});

describe('IssueEntity resolvedAt', () => {
  const makeBug = (over: Partial<Parameters<typeof IssueEntity.create>[0]> = {}) =>
    makeIssue({ kind: IssueKind.BUG, ...over });

  it('is null on a newly reported bug', () => {
    expect(makeBug().resolvedAt).toBeNull();
  });

  it('stamps the moment a bug is resolved', () => {
    const bug = makeBug();
    const before = Date.now();
    bug.setStatus(BugStatus.RESOLVED);
    expect(bug.resolvedAt?.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('keeps the original moment when a resolved bug is closed', () => {
    // Resolved → Closed is filing, not a second fix, so the solve date stands.
    const bug = makeBug();
    bug.setStatus(BugStatus.RESOLVED);
    const solved = bug.resolvedAt;
    bug.setStatus(BugStatus.CLOSED);
    expect(bug.resolvedAt).toBe(solved);
  });

  it('clears the stamp when a bug is reopened', () => {
    const bug = makeBug();
    bug.setStatus(BugStatus.RESOLVED);
    bug.setStatus(BugStatus.OPEN);
    expect(bug.resolvedAt).toBeNull();
  });

  it('does not stamp a move between two open statuses', () => {
    const bug = makeBug();
    bug.setStatus(BugStatus.IN_PROGRESS);
    expect(bug.resolvedAt).toBeNull();
  });

  it("treats a team's custom column as still open when no board is passed", () => {
    // Without the board's own done set the shipped keys are all we know, and a
    // column we've never heard of is unfinished — never a silent "done".
    const bug = makeBug();
    bug.setStatus('waiting-on-vendor');
    expect(bug.resolvedAt).toBeNull();
  });

  it("stamps a custom column the board puts in Completed", () => {
    // The whole point of status categories: a team that ships through "Released"
    // gets a resolved date, exactly as one that ships through "Resolved" does.
    const bug = makeBug();
    bug.setStatus('released', ['released']);
    expect(bug.resolvedAt).not.toBeNull();
  });

  it("clears the stamp when the board's done column is left", () => {
    const bug = makeBug();
    bug.setStatus('released', ['released']);
    bug.setStatus('waiting-on-vendor', ['released']);
    expect(bug.resolvedAt).toBeNull();
  });

  it('does not stamp a shipped done key the board has regrouped elsewhere', () => {
    // A board that moved "Resolved" out of Completed means it — its own set wins
    // over the shipped default.
    const bug = makeBug();
    bug.setStatus(BugStatus.RESOLVED, ['released']);
    expect(bug.resolvedAt).toBeNull();
  });

  it('stamps an issue created straight into a done column', () => {
    // The + Add button on the Resolved column — filed already fixed.
    expect(makeBug({ status: BugStatus.RESOLVED }).resolvedAt).not.toBeNull();
  });

  it('leaves a stored stamp exactly as it was rehydrated', () => {
    // The repository always passes the field explicitly, so a pre-resolvedAt bug
    // that is already resolved must NOT acquire today's date on load.
    const stored = new Date('2026-01-02T03:04:05.000Z');
    expect(makeBug({ status: BugStatus.CLOSED, resolvedAt: stored }).resolvedAt).toBe(stored);
    expect(makeBug({ status: BugStatus.CLOSED, resolvedAt: null }).resolvedAt).toBeNull();
  });

  it('uses the task done status for a task', () => {
    const task = makeIssue();
    task.setStatus(TaskStatus.IN_PROGRESS);
    expect(task.resolvedAt).toBeNull();
    task.setStatus(TaskStatus.DONE);
    expect(task.resolvedAt).not.toBeNull();
  });
});
