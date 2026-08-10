import { ClickUpLinkOrigin, ClickUpLinkTarget } from '@application/app-settings/domain/clickup.types';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import { IRoadmapRepository } from '@application/roadmaps/repositories/roadmap.repository';
import { ClickUpClient, ClickUpTask } from '../domain/clickup.client';
import {
  ClickUpLinkRecord,
  IClickUpLinkRepository,
} from '../repositories/clickup-link.repository';
import { ClickUpSyncBinding, IClickUpSyncRepository } from '../repositories/clickup-sync.repository';
import {
  LinkClickUpTaskUseCase,
  SetClickUpLinkDetachedUseCase,
  UnlinkClickUpTaskUseCase,
} from './clickup.use-cases';

/**
 * Which way a link runs, and how a record gets out of one.
 *
 * The invariant under all of it: **a record must never end up with two ClickUp
 * tasks.** The link row is the only memory of which task a record already owns,
 * so every path that removes, detaches or adopts one is a path that can create a
 * duplicate on the next save if it gets this wrong.
 */

const TENANT = 't1';

function link(over: Partial<ClickUpLinkRecord> = {}): ClickUpLinkRecord {
  return {
    id: 'l1',
    tenantId: TENANT,
    clickupTaskId: '86abc',
    targetType: ClickUpLinkTarget.ISSUE,
    targetId: 'i1',
    roadmapId: '',
    origin: ClickUpLinkOrigin.MANUAL,
    detached: false,
    pushedStatus: '',
    taskName: 'Fix login',
    taskUrl: 'https://app.clickup.com/t/86abc',
    customId: '',
    status: 'in progress',
    statusColor: '#4194f6',
    statusType: 'custom',
    assignees: [],
    priority: '',
    dueDate: '',
    listName: 'Sprint',
    spaceName: 'Product',
    unavailableReason: '',
    createdBy: 'u1',
    createdByName: 'Jane',
    createdAt: new Date('2026-08-01'),
    lastSyncedAt: new Date('2026-08-01'),
    ...over,
  } as ClickUpLinkRecord;
}

function linkRepo(): jest.Mocked<IClickUpLinkRepository> {
  return {
    findForTarget: jest.fn().mockResolvedValue([]),
    findForTargets: jest.fn().mockResolvedValue([]),
    findByTaskId: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    create: jest.fn(),
    updateSnapshot: jest.fn(),
    markPushed: jest.fn(),
    setDetached: jest.fn(),
    setOrigin: jest.fn(),
    removeById: jest.fn().mockResolvedValue(true),
    removeAllForTenant: jest.fn(),
  } as unknown as jest.Mocked<IClickUpLinkRepository>;
}

describe('UnlinkClickUpTaskUseCase', () => {
  it('refuses to remove a link that is still syncing', async () => {
    const links = linkRepo();
    links.findById.mockResolvedValue(link({ origin: ClickUpLinkOrigin.SYNC }));

    const result = await new UnlinkClickUpTaskUseCase(links).execute({ tenantId: TENANT, id: 'l1' });

    // Removing it would delete the only record of which ClickUp task this issue
    // owns, and the next save would make a second one.
    expect(result.isFailure).toBe(true);
    expect(links.removeById).not.toHaveBeenCalled();
  });

  it('removes a synced link once it has been detached', async () => {
    const links = linkRepo();
    links.findById.mockResolvedValue(link({ origin: ClickUpLinkOrigin.SYNC, detached: true }));

    const result = await new UnlinkClickUpTaskUseCase(links).execute({ tenantId: TENANT, id: 'l1' });

    expect(result.isSuccess).toBe(true);
    expect(links.removeById).toHaveBeenCalledWith(TENANT, 'l1');
  });

  it('removes a pasted link with no ceremony', async () => {
    const links = linkRepo();
    links.findById.mockResolvedValue(link());

    const result = await new UnlinkClickUpTaskUseCase(links).execute({ tenantId: TENANT, id: 'l1' });

    expect(result.isSuccess).toBe(true);
    expect(links.removeById).toHaveBeenCalledWith(TENANT, 'l1');
  });
});

describe('SetClickUpLinkDetachedUseCase', () => {
  it('detaches a synced link without changing which task it points at', async () => {
    const links = linkRepo();
    const synced = link({ origin: ClickUpLinkOrigin.SYNC });
    links.findById.mockResolvedValue(synced);
    links.setDetached.mockResolvedValue({ ...synced, detached: true });

    const result = await new SetClickUpLinkDetachedUseCase(links).execute({
      tenantId: TENANT,
      id: 'l1',
      detached: true,
    });

    expect(result.isSuccess).toBe(true);
    expect(links.setDetached).toHaveBeenCalledWith(TENANT, 'l1', true);
    // Still `sync`, still the same task — that pair is what stops the duplicate.
    expect(result.getValue().origin).toBe(ClickUpLinkOrigin.SYNC);
    expect(result.getValue().clickupTaskId).toBe('86abc');
  });

  it('refuses on a pasted link, which was never syncing', async () => {
    const links = linkRepo();
    links.findById.mockResolvedValue(link());

    const result = await new SetClickUpLinkDetachedUseCase(links).execute({
      tenantId: TENANT,
      id: 'l1',
      detached: true,
    });

    expect(result.isFailure).toBe(true);
    expect(links.setDetached).not.toHaveBeenCalled();
  });
});

// ─── adopting a pasted task ───────────────────────────────────────────────────

function task(over: Partial<ClickUpTask> = {}): ClickUpTask {
  return {
    id: '86abc',
    customId: '',
    name: 'Fix login',
    url: 'https://app.clickup.com/t/86abc',
    status: 'in progress',
    statusColor: '#4194f6',
    statusType: 'custom',
    assignees: [],
    priority: '',
    dueDate: '',
    listId: '900',
    listName: 'Sprint',
    spaceName: 'Product',
    ...over,
  } as ClickUpTask;
}

function binding(over: Partial<ClickUpSyncBinding> = {}): ClickUpSyncBinding {
  return { listId: '900', listName: 'Sprint', enabled: true, ...over } as ClickUpSyncBinding;
}

/** The use-case with everything mocked; `create` echoes back what it was given. */
function linkUseCase(opts: { binding: ClickUpSyncBinding | null; existing?: ClickUpLinkRecord[] }) {
  const links = linkRepo();
  links.findForTarget.mockResolvedValue(opts.existing ?? []);
  links.create.mockImplementation(async (data) =>
    link({ ...data, origin: data.origin ?? ClickUpLinkOrigin.MANUAL }),
  );

  const settings = {
    findByTenant: jest.fn().mockResolvedValue({
      clickup: { apiToken: 'pk_1', workspaceId: 'w1', enabled: true },
    }),
  } as unknown as jest.Mocked<IAppSettingsRepository>;
  const bindings = {
    findForScope: jest.fn().mockResolvedValue(opts.binding),
  } as unknown as jest.Mocked<IClickUpSyncRepository>;
  const issues = {
    findById: jest.fn().mockResolvedValue({ tenantId: TENANT, isPersonal: false, teamId: 'team1' }),
  } as unknown as jest.Mocked<IIssueRepository>;
  const roadmaps = { findById: jest.fn() } as unknown as jest.Mocked<IRoadmapRepository>;
  const client = { getTask: jest.fn().mockResolvedValue(task()) } as unknown as jest.Mocked<
    ClickUpClient
  >;

  return {
    links,
    client,
    useCase: new LinkClickUpTaskUseCase(settings, links, bindings, issues, roadmaps, client),
  };
}

const PASTE = {
  reference: 'https://app.clickup.com/t/86abc',
  targetType: ClickUpLinkTarget.ISSUE,
  targetId: 'i1',
};

describe('LinkClickUpTaskUseCase', () => {
  it('adopts a pasted task that is in the board’s bound list', async () => {
    const { links, useCase } = linkUseCase({ binding: binding() });

    const result = await useCase.execute({
      tenantId: TENANT,
      userId: 'u1',
      userName: 'Jane',
      dto: PASTE,
    });

    expect(result.isSuccess).toBe(true);
    expect(links.create).toHaveBeenCalledWith(
      expect.objectContaining({ origin: ClickUpLinkOrigin.SYNC }),
    );
  });

  it('keeps a task from another list as a read-only mirror', async () => {
    // The status map is written against the bound list's statuses; pushing them
    // at a task somewhere else would name statuses its own list never defined.
    const { links, client, useCase } = linkUseCase({ binding: binding() });
    (client.getTask as jest.Mock).mockResolvedValue(task({ listId: '999', listName: 'Backlog' }));

    await useCase.execute({ tenantId: TENANT, userId: 'u1', userName: 'Jane', dto: PASTE });

    expect(links.create).toHaveBeenCalledWith(
      expect.objectContaining({ origin: ClickUpLinkOrigin.MANUAL }),
    );
  });

  it('keeps a paste as a mirror when the board is not bound', async () => {
    const { links, useCase } = linkUseCase({ binding: null });

    await useCase.execute({ tenantId: TENANT, userId: 'u1', userName: 'Jane', dto: PASTE });

    expect(links.create).toHaveBeenCalledWith(
      expect.objectContaining({ origin: ClickUpLinkOrigin.MANUAL }),
    );
  });

  it('will not adopt a second task beside one this record already syncs', async () => {
    const { links, useCase } = linkUseCase({
      binding: binding(),
      existing: [link({ id: 'l0', clickupTaskId: 'other', origin: ClickUpLinkOrigin.SYNC })],
    });

    await useCase.execute({ tenantId: TENANT, userId: 'u1', userName: 'Jane', dto: PASTE });

    // One record, at most one synced task — a second would double every push.
    expect(links.create).toHaveBeenCalledWith(
      expect.objectContaining({ origin: ClickUpLinkOrigin.MANUAL }),
    );
  });

  it('re-pasting the task a detached record owns resumes syncing it', async () => {
    const detached = link({ origin: ClickUpLinkOrigin.SYNC, detached: true });
    const { links, useCase } = linkUseCase({ binding: binding(), existing: [detached] });
    links.create.mockResolvedValue(detached);
    links.setDetached.mockResolvedValue({ ...detached, detached: false });

    const result = await useCase.execute({
      tenantId: TENANT,
      userId: 'u1',
      userName: 'Jane',
      dto: PASTE,
    });

    expect(links.setDetached).toHaveBeenCalledWith(TENANT, 'l1', false);
    expect(result.getValue().detached).toBe(false);
  });

  it('promotes a mirror of the same task once the board is bound', async () => {
    // `create` upserts and its `origin` is insert-only, so the row comes back
    // still `manual`; the promotion has to be made explicitly after it.
    const mirror = link();
    const { links, useCase } = linkUseCase({ binding: binding(), existing: [mirror] });
    links.create.mockResolvedValue(mirror);
    links.setOrigin.mockResolvedValue({ ...mirror, origin: ClickUpLinkOrigin.SYNC });

    const result = await useCase.execute({
      tenantId: TENANT,
      userId: 'u1',
      userName: 'Jane',
      dto: PASTE,
    });

    expect(links.setOrigin).toHaveBeenCalledWith(TENANT, 'l1', ClickUpLinkOrigin.SYNC);
    expect(result.getValue().origin).toBe(ClickUpLinkOrigin.SYNC);
  });
});
