import { Result } from '@shared/logic/result';
import { Role } from '@core/interfaces';
import { IssueKind } from '@application/issues/domain/enums/issue.enums';
import { RelationType } from '@application/issue-links/domain/relation-type.enum';
import { ApiKeyScope } from '@application/api-keys/domain/api-key.enums';
import {
  McpLinkIssuesUseCase,
  McpListBacklogItemsUseCase,
  McpUnlinkIssuesUseCase,
  type McpActor,
} from './mcp.use-cases';

/**
 * Pure unit tests for the Stage-7 link/backlog wrappers. Every collaborator is a
 * hand-rolled mock — no Nest container — so each behaviour is pinned on its own:
 * both issue refs resolve to uuids and the friendly relation word maps to a
 * RelationType; backlog items flatten out of the roadmaps; the unlink id passes
 * straight through to the delete use-case.
 */

const actor: McpActor = {
  tenantId: 't1',
  keyId: 'k1',
  keyName: 'CI',
  userId: 'u1',
  scope: ApiKeyScope.READ_WRITE,
  clientName: 'claude-code/1.0',
};

describe('McpLinkIssuesUseCase', () => {
  const FROM_REF = 'TSK-7';
  const TO_REF = 'TSK-9';
  const FROM_UUID = 'uuid-from';
  const TO_UUID = 'uuid-to';

  const buildDeps = () => {
    const createLink = { execute: jest.fn().mockResolvedValue(Result.ok<void>()) };
    // Both ends resolve through GetIssueUseCase now (privacy-enforced), keyed by the
    // ref passed as `id`.
    const getIssue = {
      execute: jest.fn().mockImplementation(({ id }: { id: string }) =>
        Promise.resolve(
          Result.ok(
            id === FROM_REF
              ? { id: { toString: () => FROM_UUID }, shortId: FROM_REF, title: 'A', kind: IssueKind.TASK }
              : { id: { toString: () => TO_UUID }, shortId: TO_REF, title: 'B', kind: IssueKind.TASK },
          ),
        ),
      ),
    };
    const users = { findById: jest.fn().mockResolvedValue({ role: Role.ADMIN, name: 'Ada' }) };
    const events = { append: jest.fn().mockResolvedValue(undefined) };
    const useCase = new McpLinkIssuesUseCase(
      createLink as never,
      getIssue as never,
      users as never,
      events as never,
    );
    return { useCase, createLink, getIssue, events };
  };

  it('resolves both refs to uuids and maps a friendly type to a RelationType', async () => {
    const { useCase, createLink } = buildDeps();

    const result = await useCase.execute({
      actor,
      dto: { from: FROM_REF, to: TO_REF, type: 'blocked-by' },
    });

    expect(result.isSuccess).toBe(true);
    // The create use-case is handed the resolved uuids (never the refs) and the
    // mapped RelationType.
    expect(createLink.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        createdBy: 'u1',
        sourceId: FROM_UUID,
        targetId: TO_UUID,
        relationType: RelationType.BLOCKED_BY,
      }),
    );
    expect(result.getValue()).toEqual(
      expect.objectContaining({ fromShortId: FROM_REF, toShortId: TO_REF }),
    );
  });

  it('rejects an unknown relation type, listing the valid ones, without linking', async () => {
    const { useCase, createLink } = buildDeps();

    const result = await useCase.execute({
      actor,
      dto: { from: FROM_REF, to: TO_REF, type: 'nonsense' },
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('blocks');
    expect(createLink.execute).not.toHaveBeenCalled();
  });
});

describe('McpListBacklogItemsUseCase', () => {
  it('returns the backlog items from GetRoadmapsUseCase', async () => {
    const getRoadmaps = {
      execute: jest.fn().mockResolvedValue(
        Result.ok([
          {
            id: { toString: () => 'rm1' },
            title: 'Product',
            items: [
              {
                id: 'i1',
                shortId: 'RM-AAA',
                title: 'Idea one',
                phase: 'now',
                status: 'planned',
                reach: 3,
                impact: 3,
                confidence: 3,
                effort: 3,
              },
            ],
          },
        ]),
      ),
    };
    const useCase = new McpListBacklogItemsUseCase(getRoadmaps as never);

    const result = await useCase.execute({ actor, dto: {} });

    expect(result.isSuccess).toBe(true);
    const items = result.getValue();
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(
      expect.objectContaining({
        shortId: 'RM-AAA',
        title: 'Idea one',
        phase: 'now',
        roadmapTitle: 'Product',
        riceScore: 9,
      }),
    );
  });
});

describe('McpUnlinkIssuesUseCase', () => {
  it('passes the link id through to the delete use-case', async () => {
    const deleteLink = { execute: jest.fn().mockResolvedValue(Result.ok<void>()) };
    const users = { findById: jest.fn().mockResolvedValue({ role: Role.ADMIN, name: 'Ada' }) };
    const events = { append: jest.fn().mockResolvedValue(undefined) };
    const useCase = new McpUnlinkIssuesUseCase(
      deleteLink as never,
      users as never,
      events as never,
    );

    const result = await useCase.execute({ actor, dto: { link: 'link-42' } });

    expect(result.isSuccess).toBe(true);
    expect(deleteLink.execute).toHaveBeenCalledWith({ tenantId: 't1', id: 'link-42' });
    expect(result.getValue()).toEqual({ linkId: 'link-42' });
  });
});
