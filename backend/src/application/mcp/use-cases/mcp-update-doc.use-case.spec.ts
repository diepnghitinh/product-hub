import { Result } from '@shared/logic/result';
import { McpUpdateDocUseCase, type McpActor } from './mcp.use-cases';
import { ApiKeyScope } from '@application/api-keys/domain/api-key.enums';

/**
 * Pure unit test for the MCP update-doc wrapper. Every collaborator is a
 * hand-rolled mock — no Nest container — so the two behaviours the spec pins down
 * are exercised on their own: the doc-level title/tags path delegates to
 * UpdateDocUseCase, and the content path converts the body and edits the doc's
 * FIRST page when `page` is omitted.
 */

const DOC_REF = 'DOC-ABC';
const DOC_UUID = 'uuid-of-doc';
const FIRST_PAGE_ID = 'page-1';
const SECOND_PAGE_ID = 'page-2';

const fakeDoc = {
  id: { toString: () => DOC_UUID },
  title: 'Discovery notes',
  tags: ['discovery'],
};

const fakePages = [
  { id: { toString: () => FIRST_PAGE_ID }, title: 'Discovery notes' },
  { id: { toString: () => SECOND_PAGE_ID }, title: 'Appendix' },
];

const actor: McpActor = {
  tenantId: 't1',
  keyId: 'k1',
  keyName: 'CI',
  userId: 'u1',
  scope: ApiKeyScope.READ_WRITE,
  clientName: 'claude-code/1.0',
};

const buildDeps = () => {
  const getDoc = {
    execute: jest.fn().mockResolvedValue(Result.ok({ doc: fakeDoc, pages: fakePages })),
  };
  const updateDoc = { execute: jest.fn().mockResolvedValue(Result.ok(fakeDoc)) };
  const updatePage = {
    execute: jest.fn().mockResolvedValue(Result.ok({ id: { toString: () => FIRST_PAGE_ID } })),
  };
  const createPage = {
    execute: jest.fn().mockResolvedValue(Result.ok({ id: { toString: () => SECOND_PAGE_ID } })),
  };
  const users = { findById: jest.fn().mockResolvedValue({ name: 'Ada' }) };
  const events = { append: jest.fn().mockResolvedValue(undefined) };
  const useCase = new McpUpdateDocUseCase(
    getDoc as never,
    updateDoc as never,
    updatePage as never,
    createPage as never,
    users as never,
    events as never,
  );
  return { useCase, getDoc, updateDoc, updatePage, createPage, events };
};

describe('McpUpdateDocUseCase', () => {
  it('renames/retags via UpdateDocUseCase without touching any page', async () => {
    const { useCase, updateDoc, updatePage, createPage } = buildDeps();

    const result = await useCase.execute({
      actor,
      dto: { doc: DOC_REF, title: 'New title', tags: ['q3', 'spec'] },
    });

    expect(result.isSuccess).toBe(true);
    expect(updateDoc.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        id: DOC_UUID,
        tenantId: 't1',
        dto: { title: 'New title', tags: ['q3', 'spec'] },
      }),
    );
    // Doc-level only — no page write of either kind.
    expect(updatePage.execute).not.toHaveBeenCalled();
    expect(createPage.execute).not.toHaveBeenCalled();
    expect(result.getValue().changed).toContain('renamed');
    expect(result.getValue().changed).toContain('retagged');
  });

  it('converts the body and edits the FIRST page when `page` is omitted', async () => {
    const { useCase, updateDoc, updatePage } = buildDeps();

    const result = await useCase.execute({
      actor,
      dto: { doc: DOC_REF, content: '## Findings\n\n- one\n- two' },
    });

    expect(result.isSuccess).toBe(true);
    // No doc-level metadata change requested.
    expect(updateDoc.execute).not.toHaveBeenCalled();
    // The first page is the target, and the Markdown became HTML tags.
    expect(updatePage.execute).toHaveBeenCalledTimes(1);
    const arg = updatePage.execute.mock.calls[0][0];
    expect(arg).toEqual(
      expect.objectContaining({ docId: DOC_UUID, pageId: FIRST_PAGE_ID, tenantId: 't1' }),
    );
    expect(arg.dto.content).toContain('<h2>Findings</h2>');
    expect(arg.dto.content).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(result.getValue().changed).toContain('edited a page');
  });

  it('edits the named page when `page` is supplied', async () => {
    const { useCase, updatePage } = buildDeps();

    const result = await useCase.execute({
      actor,
      dto: { doc: DOC_REF, page: SECOND_PAGE_ID, content: 'Just text' },
    });

    expect(result.isSuccess).toBe(true);
    expect(updatePage.execute).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: SECOND_PAGE_ID }),
    );
  });

  it('rejects a call that changes nothing', async () => {
    const { useCase } = buildDeps();
    const result = await useCase.execute({ actor, dto: { doc: DOC_REF } });
    expect(result.isFailure).toBe(true);
  });
});
