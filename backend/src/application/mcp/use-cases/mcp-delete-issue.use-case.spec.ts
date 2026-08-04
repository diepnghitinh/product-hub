import { Result } from '@shared/logic/result';
import { Role } from '@core/interfaces';
import { IssueKind } from '@application/issues/domain/enums/issue.enums';
import { McpDeleteIssueUseCase, type McpActor } from './mcp.use-cases';
import { ApiKeyScope } from '@application/api-keys/domain/api-key.enums';

/**
 * Pure unit test for the MCP delete wrapper. Every collaborator is a hand-rolled
 * mock — no Nest container — so the two behaviours the spec pins down are exercised
 * on their own: ref→uuid resolution before the delete use-case, and the
 * subtask guard that refuses to orphan children.
 */

const REF = 'TSK-7';
const UUID = 'uuid-of-tsk-7';

const fakeIssue = {
  id: { toString: () => UUID },
  shortId: REF,
  title: 'Parent task',
  kind: IssueKind.TASK,
};

const actor: McpActor = {
  tenantId: 't1',
  keyId: 'k1',
  keyName: 'CI',
  userId: 'u1',
  scope: ApiKeyScope.READ_WRITE_DELETE,
  clientName: 'claude-code/1.0',
};

const buildDeps = (
  subtasks: { shortId: string; title: string }[],
  totalCount = subtasks.length,
) => {
  const deleteIssue = { execute: jest.fn().mockResolvedValue(Result.ok<void>()) };
  const getIssues = {
    execute: jest.fn().mockResolvedValue(Result.ok({ data: subtasks })),
  };
  const issues = {
    findByRef: jest.fn().mockResolvedValue(fakeIssue),
    // The orphan guard's authoritative, owner-blind count — may exceed the
    // privacy-filtered visible list when some children are personal tasks.
    countChildren: jest.fn().mockResolvedValue(totalCount),
  };
  const users = { findById: jest.fn().mockResolvedValue({ role: Role.ADMIN, name: 'Ada' }) };
  const events = { append: jest.fn().mockResolvedValue(undefined) };
  const useCase = new McpDeleteIssueUseCase(
    deleteIssue as never,
    getIssues as never,
    issues as never,
    users as never,
    events as never,
  );
  return { useCase, deleteIssue, getIssues, issues, events };
};

describe('McpDeleteIssueUseCase', () => {
  it('resolves the ref to a uuid before calling the delete use-case', async () => {
    const { useCase, deleteIssue, issues } = buildDeps([]);

    const result = await useCase.execute({ actor, dto: { issue: REF } });

    expect(result.isSuccess).toBe(true);
    // findByRef receives the human ref…
    expect(issues.findByRef).toHaveBeenCalledWith('t1', REF);
    // …and the delete use-case is handed the resolved uuid, never the ref.
    expect(deleteIssue.execute).toHaveBeenCalledWith(
      expect.objectContaining({ id: UUID, canDeleteBug: true, isAdmin: true }),
    );
    expect(result.getValue()).toEqual(
      expect.objectContaining({ shortId: REF, title: 'Parent task', kind: IssueKind.TASK }),
    );
  });

  it('refuses to delete while subtasks exist, listing them, and never calls delete', async () => {
    const { useCase, deleteIssue } = buildDeps([
      { shortId: 'TSK-8', title: 'Child A' },
      { shortId: 'TSK-9', title: 'Child B' },
    ]);

    const result = await useCase.execute({ actor, dto: { issue: REF } });

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('2 subtask');
    expect(result.error).toContain('TSK-8');
    expect(result.error).toContain('TSK-9');
    expect(deleteIssue.execute).not.toHaveBeenCalled();
  });

  it('blocks on a private (hidden) child that the visible list does not show', async () => {
    // countChildren sees 1 child, but the privacy-filtered read returns none —
    // a personal-task child. The guard must still refuse and account for it.
    const { useCase, deleteIssue } = buildDeps([], 1);

    const result = await useCase.execute({ actor, dto: { issue: REF } });

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('1 subtask');
    expect(result.error).toContain('1 more');
    expect(deleteIssue.execute).not.toHaveBeenCalled();
  });
});
