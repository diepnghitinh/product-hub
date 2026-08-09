import {
  IssueStatusCategory,
  completedKeysOf,
} from '@application/issues/domain/enums/status-category.enums';
import { TeamIssueType, TeamStatusConfig } from '../enums/team.enums';
import { STATUS_BUILTIN_LOCKED, STATUS_NEEDS_COMPLETED, TeamEntity } from './team.entity';

const makeTeam = (issueType = TeamIssueType.TASK) =>
  TeamEntity.create({ tenantId: 't1', key: 'eng', name: 'Engineering', issueType }).getValue();

/** The four columns a task board ships with, as the settings screen sends them. */
const taskColumns = (over: Partial<Record<string, IssueStatusCategory>> = {}): TeamStatusConfig[] =>
  [
    { key: 'todo', label: 'Backlog', color: '#6b7280', category: IssueStatusCategory.UNSTARTED },
    {
      key: 'in-progress',
      label: 'In progress',
      color: '#2563eb',
      category: IssueStatusCategory.STARTED,
    },
    { key: 'done', label: 'Done', color: '#16a34a', category: IssueStatusCategory.COMPLETED },
  ].map((c) => ({ ...c, category: over[c.key] ?? c.category }));

describe('TeamEntity.setStatuses', () => {
  it('keeps a custom column in the group it was given', () => {
    const team = makeTeam();
    const res = team.setStatuses([
      ...taskColumns(),
      {
        key: 'custom-4',
        label: 'Released',
        color: '#a855f7',
        category: IssueStatusCategory.COMPLETED,
        description: 'Shipped to production',
      },
    ]);
    expect(res.isSuccess).toBe(true);
    // Both count as done — that is what makes "Released" finishable.
    expect(completedKeysOf(team.statuses)).toEqual(['done', 'custom-4']);
    expect(team.statuses.at(-1)?.description).toBe('Shipped to production');
  });

  it('refuses a board with nothing in Completed', () => {
    // Nothing could ever finish: no resolved date, no burn-up, and every issue
    // rolling into the next cycle forever.
    const team = makeTeam();
    const res = team.setStatuses(taskColumns({ done: IssueStatusCategory.STARTED }));
    expect(res.isFailure).toBe(true);
    expect(res.error).toBe(STATUS_NEEDS_COMPLETED);
  });

  it('does not count Canceled or Duplicate as done', () => {
    const team = makeTeam();
    const res = team.setStatuses([
      ...taskColumns({ done: IssueStatusCategory.CANCELED }),
      { key: 'dupe', label: 'Duplicate', color: '#6b7280', category: IssueStatusCategory.DUPLICATE },
    ]);
    expect(res.isFailure).toBe(true);
    expect(res.error).toBe(STATUS_NEEDS_COMPLETED);
  });

  it('still refuses to drop a built-in column', () => {
    const team = makeTeam();
    const res = team.setStatuses(taskColumns().filter((c) => c.key !== 'todo'));
    expect(res.isFailure).toBe(true);
    expect(res.error).toContain(STATUS_BUILTIN_LOCKED);
  });

  it('fills in the category of a column saved before categories existed', () => {
    const team = makeTeam();
    // No `category` on the wire — a client that predates the field, or an import.
    const legacy = taskColumns().map(({ key, label, color }) => ({ key, label, color }));
    expect(team.setStatuses(legacy as TeamStatusConfig[]).isSuccess).toBe(true);
    expect(team.statuses.map((s) => s.category)).toEqual([
      IssueStatusCategory.UNSTARTED,
      IssueStatusCategory.STARTED,
      IssueStatusCategory.COMPLETED,
    ]);
  });

  it('caps a description rather than rejecting it', () => {
    const team = makeTeam();
    const long = 'x'.repeat(500);
    expect(team.setStatuses(taskColumns().map((c) => ({ ...c, description: long }))).isSuccess).toBe(
      true,
    );
    expect(team.statuses[0].description).toHaveLength(200);
  });
});
