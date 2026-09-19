import { GetIssueUseCase } from './get-issue.use-case';
import { IssueEntity } from '../domain/entities/issue.entity';
import { IssueKind } from '../domain/enums/issue.enums';

const makeIssue = (over: Partial<Parameters<typeof IssueEntity.create>[0]> = {}) =>
  IssueEntity.create({
    kind: IssueKind.BUG,
    tenantId: 't1',
    title: 'Nút Lưu không phản hồi',
    createdBy: 'u1',
    ...over,
  }).getValue();

/** A repo that answers `findByRef` from a ref → issue table, like the real one
 *  (which matches a shortId first, then an id). */
const repoOf = (byRef: Record<string, IssueEntity>) => ({
  findByRef: jest.fn((_tenantId: string, ref: string) => Promise.resolve(byRef[ref] ?? null)),
  // No sub-tasks in these fixtures — an empty map is what the real aggregation
  // returns for a leaf, and the use-case reads that as `{0,0}`.
  childRollups: jest.fn(() => Promise.resolve({})),
});

const build = (byRef: Record<string, IssueEntity>) => {
  const issues = repoOf(byRef);
  return { useCase: new GetIssueUseCase(issues as never), issues };
};

describe('GetIssueUseCase parent resolution', () => {
  const read = { tenantId: 't1', requesterId: 'u1', isAdmin: false };

  it('resolves the parent so a sub-issue can name it', async () => {
    // The whole point: `parentId` on its own is an opaque id, so every surface
    // that had only the issue showed a sub-issue as top-level.
    const parent = makeIssue({ shortId: 'BUG-P8CD2YC', title: 'Lỗi trang thanh toán' });
    const child = makeIssue({ shortId: 'BUG-MJTRZ4Z', parentId: 'parent-id' });
    const { useCase } = build({ 'BUG-MJTRZ4Z': child, 'parent-id': parent });

    const result = await useCase.execute({ id: 'BUG-MJTRZ4Z', ...read });

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().parent?.shortId).toBe('BUG-P8CD2YC');
  });

  it('reports no parent for a top-level issue, without a second read', async () => {
    const { useCase, issues } = build({ 'BUG-1': makeIssue({ shortId: 'BUG-1' }) });

    const result = await useCase.execute({ id: 'BUG-1', ...read });

    expect(result.getValue().parent).toBeNull();
    expect(issues.findByRef).toHaveBeenCalledTimes(1);
  });

  it('degrades a dangling parentId to no parent rather than failing the read', async () => {
    // The parent was deleted out from under it — the child must still open.
    const child = makeIssue({ shortId: 'BUG-2', parentId: 'gone' });
    const { useCase } = build({ 'BUG-2': child });

    const result = await useCase.execute({ id: 'BUG-2', ...read });

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().parent).toBeNull();
  });

  it("hides a parent the caller can't read", async () => {
    // Someone else's private personal task must not leak its title through a
    // breadcrumb on a child that is itself readable.
    const parent = makeIssue({ kind: IssueKind.TASK, ownerId: 'someone-else', shortId: 'TSK-9' });
    const child = makeIssue({ shortId: 'BUG-3', parentId: 'private-parent' });
    const { useCase } = build({ 'BUG-3': child, 'private-parent': parent });

    const result = await useCase.execute({ id: 'BUG-3', ...read });

    expect(result.getValue().issue.shortId).toBe('BUG-3');
    expect(result.getValue().parent).toBeNull();
  });

  it('shows that same parent to an admin', async () => {
    const parent = makeIssue({ kind: IssueKind.TASK, ownerId: 'someone-else', shortId: 'TSK-9' });
    const child = makeIssue({ shortId: 'BUG-3', parentId: 'private-parent' });
    const { useCase } = build({ 'BUG-3': child, 'private-parent': parent });

    const result = await useCase.execute({ id: 'BUG-3', ...read, isAdmin: true });

    expect(result.getValue().parent?.shortId).toBe('TSK-9');
  });
});
