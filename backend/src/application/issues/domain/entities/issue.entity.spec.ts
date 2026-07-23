import { IssueEntity } from './issue.entity';
import { IssueKind } from '../enums/issue.enums';

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
