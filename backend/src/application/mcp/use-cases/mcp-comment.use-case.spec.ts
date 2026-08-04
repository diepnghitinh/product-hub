import { Result } from '@shared/logic/result';
import { Role } from '@core/interfaces';
import { IssueKind } from '@application/issues/domain/enums/issue.enums';
import { ApiKeyScope } from '@application/api-keys/domain/api-key.enums';
import {
  McpAddCommentUseCase,
  McpDeleteCommentUseCase,
  type McpActor,
} from './mcp.use-cases';

/**
 * Pure unit tests for the MCP comment wrappers. Every collaborator is a hand-rolled
 * mock — no Nest container — so the two behaviours the spec pins down are exercised
 * on their own: add_comment resolving mention *names* to userIds before the DTO
 * reaches the create use-case, and delete_comment handing the create-use-case the
 * role resolved from the key owner.
 */

const REF = 'BUG-12';
const UUID = 'uuid-of-bug-12';

const fakeIssue = {
  id: { toString: () => UUID },
  shortId: REF,
  title: 'Login fails',
  kind: IssueKind.BUG,
};

const actor: McpActor = {
  tenantId: 't1',
  keyId: 'k1',
  keyName: 'CI',
  userId: 'u1',
  scope: ApiKeyScope.READ_WRITE_DELETE,
  clientName: 'claude-code/1.0',
};

// Two people to resolve mentions against — by name and by first name.
const people = [
  { id: { toString: () => 'user-jane' }, name: 'Jane Doe', email: 'jane@acme.co' },
  { id: { toString: () => 'user-aaron' }, name: 'Aaron Smith', email: 'aaron@acme.co' },
];

describe('McpAddCommentUseCase', () => {
  const build = (ownerRole = Role.TESTER) => {
    const createdComment = {
      id: { toString: () => 'comment-1' },
      authorName: 'Ada',
      body: 'Looks broken',
      parentId: '',
    };
    const createComment = {
      execute: jest.fn().mockResolvedValue(Result.ok(createdComment)),
    };
    const issues = { findByRef: jest.fn().mockResolvedValue(fakeIssue) };
    const users = {
      findById: jest.fn().mockResolvedValue({ role: ownerRole, name: 'Ada' }),
      findByTenant: jest.fn().mockResolvedValue({ data: people }),
    };
    const events = { append: jest.fn().mockResolvedValue(undefined) };
    const useCase = new McpAddCommentUseCase(
      createComment as never,
      issues as never,
      users as never,
      events as never,
    );
    return { useCase, createComment, issues, events };
  };

  it('resolves mention names/emails to userIds before creating the comment', async () => {
    const { useCase, createComment, issues } = build();

    const result = await useCase.execute({
      actor,
      dto: { issue: REF, body: 'Please look @Jane', mentions: ['Jane', 'aaron@acme.co'] },
    });

    expect(result.isSuccess).toBe(true);
    // Ref → uuid before the create use-case, which takes the issue id.
    expect(issues.findByRef).toHaveBeenCalledWith('t1', REF);
    // Names/emails resolved to userIds on the DTO — never the raw names.
    expect(createComment.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        issueId: UUID,
        authorId: 'u1',
        dto: expect.objectContaining({
          // Plain text is wrapped as a paragraph by the Markdown converter.
          body: '<p>Please look @Jane</p>',
          mentions: ['user-jane', 'user-aaron'],
        }),
      }),
    );
    expect(result.getValue()).toEqual(
      expect.objectContaining({ id: 'comment-1', issueShortId: REF }),
    );
  });

  it('converts a Markdown body (code fence + bold) to editor HTML', async () => {
    const { useCase, createComment } = build();

    await useCase.execute({
      actor,
      dto: { issue: REF, body: '**Repro:**\n\n```js\nboom()\n```' },
    });

    const sent = createComment.execute.mock.calls[0][0].dto.body as string;
    expect(sent).toContain('<b>Repro:</b>');
    expect(sent).toContain('<pre>boom()</pre>');
    expect(sent).not.toContain('```'); // the fence markers are gone
  });

  it('passes HTML through unchanged', async () => {
    const { useCase, createComment } = build();

    await useCase.execute({
      actor,
      dto: { issue: REF, body: '<p>already <b>html</b></p>' },
    });

    expect(createComment.execute.mock.calls[0][0].dto.body).toBe('<p>already <b>html</b></p>');
  });

  it('fails with the valid people when a mention cannot be resolved', async () => {
    const { useCase, createComment } = build();

    const result = await useCase.execute({
      actor,
      dto: { issue: REF, body: 'hi @Nobody', mentions: ['Nobody'] },
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('Nobody');
    expect(result.error).toContain('Jane Doe');
    expect(createComment.execute).not.toHaveBeenCalled();
  });
});

describe('McpDeleteCommentUseCase', () => {
  const build = (ownerRole: Role) => {
    const deleteComment = { execute: jest.fn().mockResolvedValue(Result.ok<void>()) };
    const issues = { findByRef: jest.fn().mockResolvedValue(fakeIssue) };
    const users = { findById: jest.fn().mockResolvedValue({ role: ownerRole, name: 'Ada' }) };
    const events = { append: jest.fn().mockResolvedValue(undefined) };
    const useCase = new McpDeleteCommentUseCase(
      deleteComment as never,
      issues as never,
      users as never,
      events as never,
    );
    return { useCase, deleteComment };
  };

  it('passes the role resolved from the key owner to the delete use-case', async () => {
    const { useCase, deleteComment } = build(Role.PRODUCT);

    const result = await useCase.execute({ actor, dto: { issue: REF, comment: 'comment-9' } });

    expect(result.isSuccess).toBe(true);
    expect(deleteComment.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        issueId: UUID,
        commentId: 'comment-9',
        userId: 'u1',
        role: Role.PRODUCT,
      }),
    );
    expect(result.getValue()).toEqual({ id: 'comment-9', issueShortId: REF });
  });

  it('defaults an owner with no role to TESTER when calling delete', async () => {
    // A key owner deleted from the workspace resolves to null → TESTER.
    const deleteComment = { execute: jest.fn().mockResolvedValue(Result.ok<void>()) };
    const issues = { findByRef: jest.fn().mockResolvedValue(fakeIssue) };
    const users = { findById: jest.fn().mockResolvedValue(null) };
    const events = { append: jest.fn().mockResolvedValue(undefined) };
    const useCase = new McpDeleteCommentUseCase(
      deleteComment as never,
      issues as never,
      users as never,
      events as never,
    );

    await useCase.execute({ actor, dto: { issue: REF, comment: 'comment-9' } });

    expect(deleteComment.execute).toHaveBeenCalledWith(
      expect.objectContaining({ role: Role.TESTER }),
    );
  });
});
