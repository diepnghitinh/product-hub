import { Inject, Injectable, Logger } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { shareToken } from '@module-shared/utils/short-id.util';
import { AppSettingsEntity } from '@application/app-settings/domain/app-settings.entity';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import { IRoadmapRepository } from '@application/roadmaps/repositories/roadmap.repository';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { UserEntity } from '@application/users/domain/entities/user.entity';
import { QueryUserDto } from '@application/users/dtos/query-user.dto';
import {
  ClickUpConfig,
  ClickUpLinkOrigin,
  ClickUpLinkTarget,
  ClickUpSyncScope,
  ClickUpUserLink,
  newClickUpDefaults,
} from '@application/app-settings/domain/clickup.types';
import { IClickUpSync } from '@application/integrations/clickup-sync.port';
import {
  ClickUpLinkRecord,
  ClickUpTaskSnapshot,
  IClickUpLinkRepository,
} from '../repositories/clickup-link.repository';
import { IClickUpSyncRepository } from '../repositories/clickup-sync.repository';
import { ourStatusFor } from '../domain/clickup-status-map';
import {
  ClickUpApiError,
  ClickUpClient,
  ClickUpMember,
  ClickUpTask,
  ClickUpWorkspace,
} from '../domain/clickup.client';
import {
  parseClickUpEvent,
  parseClickUpTaskRef,
  verifyClickUpSignature,
} from '../domain/clickup-event.parser';
import {
  ClickUpTargetDto,
  ConnectClickUpDto,
  LinkClickUpTaskDto,
  ProbeClickUpDto,
} from '../dtos/clickup.dtos';

/**
 * ClickUp, end to end.
 *
 * Three rules run through every use-case below, because they're the product
 * decisions this feature was built on:
 *
 * 1. **A pasted link is a mirror, and only a mirror.** Where somebody dropped a
 *    ClickUp URL onto a record ({@link ClickUpLinkOrigin.MANUAL}), the ClickUp
 *    status lands in the link's snapshot and is rendered *beside* the record —
 *    it never becomes the record's own status, and we never write to that task.
 *    It belongs to someone else, in a list we know nothing about.
 * 2. **A bound board syncs, and status is the only thing that comes back.**
 *    Where a team or a roadmap is bound to a ClickUp list, every issue on it has
 *    a task *we* created ({@link ClickUpLinkOrigin.SYNC}). Title, description,
 *    dates, priority and people are pushed out from here; the one field allowed
 *    to travel inward is status, through the binding's explicit map. So a
 *    developer dragging the card in ClickUp moves the work, and nobody with
 *    ClickUp access can rename or reassign anything in this workspace.
 * 3. **The token never leaves.** It is loaded from settings inside these
 *    use-cases and handed straight to `ClickUpClient`. No response DTO carries it.
 */

async function loadOrDefault(
  repo: IAppSettingsRepository,
  tenantId: string,
): Promise<AppSettingsEntity> {
  return (await repo.findByTenant(tenantId)) ?? AppSettingsEntity.create({ tenantId }).getValue();
}

/**
 * Turn a ClickUp API failure into a sentence an admin can act on.
 *
 * `notFound` is a parameter because a 404 means different things on different
 * calls — reading a pasted task means "no such task", creating one in a bound
 * list means "no such list" — and sending someone hunting for the wrong missing
 * thing is worse than saying nothing.
 */
function apiFailure(err: unknown, notFound = 'ClickUp could not find that task.'): string {
  if (err instanceof ClickUpApiError) {
    if (err.status === 401) return 'ClickUp rejected that token. Check it and try again.';
    if (err.status === 403) return 'That token cannot access this workspace.';
    if (err.status === 404) return notFound;
    if (err.status === 429) return 'ClickUp is rate-limiting us. Try again in a minute.';
    if (err.status === 0) return `Could not reach ClickUp: ${err.message}`;
    return err.message;
  }
  return 'Could not reach ClickUp';
}

/**
 * Narrow a stored link back down to just its mirrored half.
 *
 * Not cosmetic: `updateSnapshot` writes with `updateMany` across every link to a
 * task, so spreading a whole `ClickUpLinkRecord` into it would copy one link's
 * `targetId` and `roadmapId` over all the others — quietly re-pointing them at
 * the wrong record.
 */
function snapshotFrom(link: ClickUpTaskSnapshot): ClickUpTaskSnapshot {
  return {
    taskName: link.taskName,
    taskUrl: link.taskUrl,
    customId: link.customId,
    status: link.status,
    statusColor: link.statusColor,
    statusType: link.statusType,
    assignees: link.assignees,
    priority: link.priority,
    dueDate: link.dueDate,
    listName: link.listName,
    spaceName: link.spaceName,
    unavailableReason: link.unavailableReason,
  };
}

/** The mirrored half of a link, from a freshly read task. */
function snapshotOf(task: ClickUpTask): ClickUpTaskSnapshot {
  return {
    taskName: task.name,
    taskUrl: task.url,
    customId: task.customId,
    status: task.status,
    statusColor: task.statusColor,
    statusType: task.statusType,
    assignees: task.assignees,
    priority: task.priority,
    dueDate: task.dueDate,
    listName: task.listName,
    spaceName: task.spaceName,
    unavailableReason: '',
  };
}

/**
 * A ceiling on the people table, not a page of it.
 *
 * Paging this list would be the wrong shape: the question it answers is "does
 * *everyone* sync?", and an answer that stops at ten is worse than no answer.
 * High enough that no real workspace reaches it — and a workspace that does has
 * a bigger problem than this screen.
 */
const MAX_PEOPLE = 500;

/** One row of the people table, resolved the way the push would resolve it. */
export interface ClickUpPersonRow {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string;
  memberId: number;
  clickupUsername: string;
  clickupEmail: string;
  pinned: boolean;
}

/**
 * Who this person reaches in ClickUp — pin first, then email, then nobody.
 *
 * Deliberately the same order as `ClickUpSyncService.clickUpIdsFor`, because a
 * screen that shows a different answer from the one the push uses is worse than
 * no screen. The difference is only in scope: this reads the workspace roster
 * (who has a seat), the push then narrows to the list roster (who can be
 * assigned *here*).
 *
 * A pin whose member has since left the workspace still renders, from the name
 * cached when it was saved — showing a blank row would suggest nothing was ever
 * configured, when in fact something was configured and has since gone stale.
 */
function resolvePerson(
  user: UserEntity,
  userMap: ClickUpUserLink[],
  members: ClickUpMember[],
): ClickUpPersonRow {
  const userId = user.id.toString();
  const base = {
    userId,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? '',
  };
  const pin = userMap.find((p) => p.userId === userId);
  if (pin) {
    const live = members.find((m) => m.id === pin.memberId);
    return {
      ...base,
      memberId: pin.memberId,
      clickupUsername: live?.username || pin.username,
      clickupEmail: live?.email || pin.email,
      pinned: true,
    };
  }
  const email = user.email.toLowerCase();
  const matched = members.find((m) => m.email && m.email === email);
  return {
    ...base,
    memberId: matched?.id ?? 0,
    clickupUsername: matched?.username ?? '',
    clickupEmail: matched?.email ?? '',
    pinned: false,
  };
}

/**
 * Check a token and list what it can see.
 *
 * Also the connect form's first step: an admin has a token long before they know
 * their numeric workspace id, so we ask ClickUp and offer the answer as a list.
 * Nothing is persisted here — a probe that fails leaves no trace.
 */
@Injectable()
export class ProbeClickUpUseCase implements IUsecaseExecute<
  { dto: ProbeClickUpDto },
  Result<ClickUpWorkspace[]>
> {
  constructor(private readonly client: ClickUpClient) {}

  async execute({ dto }: { dto: ProbeClickUpDto }): Promise<Result<ClickUpWorkspace[]>> {
    const apiToken = dto.apiToken?.trim();
    if (!apiToken) return Result.fail('A ClickUp API token is required');
    try {
      const workspaces = await this.client.listWorkspaces(apiToken);
      if (!workspaces.length) return Result.fail('That token cannot see any ClickUp workspace');
      return Result.ok(workspaces);
    } catch (err) {
      return Result.fail(apiFailure(err));
    }
  }
}

/**
 * Connect a workspace: store the token and register the webhook.
 *
 * The webhook is best-effort by design. If ClickUp refuses to register it (a
 * token without webhook scope, or a dev machine ClickUp can't reach), we still
 * save the connection — linking and the Refresh button work fine without it, and
 * a half-connected state the admin can see beats an error that loses the token
 * they just pasted.
 */
@Injectable()
export class ConnectClickUpUseCase implements IUsecaseExecute<
  { tenantId: string; dto: ConnectClickUpDto; webhookBase: string },
  Result<{ settings: AppSettingsEntity; webhookWarning: string }>
> {
  private readonly logger = new Logger(ConnectClickUpUseCase.name);

  constructor(
    @Inject(IAppSettingsRepository) private readonly repo: IAppSettingsRepository,
    private readonly client: ClickUpClient,
  ) {}

  async execute({
    tenantId,
    dto,
    webhookBase,
  }: {
    tenantId: string;
    dto: ConnectClickUpDto;
    /** Public origin ClickUp will post to, e.g. `https://api.example.com`. */
    webhookBase: string;
  }): Promise<Result<{ settings: AppSettingsEntity; webhookWarning: string }>> {
    const apiToken = dto.apiToken?.trim();
    const workspaceId = dto.workspaceId?.trim();
    if (!apiToken) return Result.fail('A ClickUp API token is required');
    if (!workspaceId) return Result.fail('Choose a ClickUp workspace');

    // Never take the caller's word for it: re-verify the token against the
    // workspace it claims, so a bad pair can't be persisted and then fail
    // silently on every later read.
    let workspace: ClickUpWorkspace | undefined;
    try {
      const workspaces = await this.client.listWorkspaces(apiToken);
      workspace = workspaces.find((w) => w.id === workspaceId);
    } catch (err) {
      return Result.fail(apiFailure(err));
    }
    if (!workspace) return Result.fail('That token cannot access the chosen workspace');

    const settings = await loadOrDefault(this.repo, tenantId);
    const previous = settings.clickup;

    // Reconnecting reuses the URL token so an admin who re-pastes a rotated
    // ClickUp token doesn't also have to re-point anything at a new URL.
    const urlToken = previous?.urlToken || shareToken() + shareToken();

    // One webhook per tenant. A reconnect deletes the old one first, or ClickUp
    // keeps delivering to both and every event gets handled twice.
    if (previous?.webhookId) {
      await this.client.deleteWebhook(previous.apiToken || apiToken, previous.webhookId);
    }

    let webhookId = '';
    let webhookSecret = '';
    let webhookWarning = '';
    try {
      const hook = await this.client.createWebhook(
        apiToken,
        workspaceId,
        `${webhookBase}/v1/public/clickup/${urlToken}`,
      );
      webhookId = hook.id;
      webhookSecret = hook.secret;
    } catch (err) {
      webhookWarning = apiFailure(err);
      this.logger.warn(`ClickUp webhook registration failed for ${tenantId}: ${webhookWarning}`);
    }

    const defaults = newClickUpDefaults();
    const config: ClickUpConfig = {
      apiToken,
      workspaceId,
      workspaceName: dto.workspaceName?.trim() || workspace.name,
      webhookId,
      webhookSecret,
      urlToken,
      ...defaults,
      // A reconnect keeps the delivery history — it's the same wire, and
      // blanking it would read as "the integration has never worked".
      connectedAt: previous?.connectedAt || defaults.connectedAt,
      lastEventAt: previous?.lastEventAt ?? '',
      lastEventSummary: previous?.lastEventSummary ?? '',
    };

    settings.setClickUp(config);
    await this.repo.save(settings);
    return Result.ok({ settings, webhookWarning });
  }
}

/** Pause or resume the mirror without losing the connection. */
@Injectable()
export class SetClickUpEnabledUseCase implements IUsecaseExecute<
  { tenantId: string; enabled: boolean },
  Result<AppSettingsEntity>
> {
  constructor(@Inject(IAppSettingsRepository) private readonly repo: IAppSettingsRepository) {}

  async execute({
    tenantId,
    enabled,
  }: {
    tenantId: string;
    enabled: boolean;
  }): Promise<Result<AppSettingsEntity>> {
    const settings = await loadOrDefault(this.repo, tenantId);
    if (!settings.clickup) return Result.fail('ClickUp is not connected');
    settings.setClickUp({ ...settings.clickup, enabled });
    await this.repo.save(settings);
    return Result.ok(settings);
  }
}

/**
 * The people screen: who on our side reaches whom in ClickUp.
 *
 * It answers with the *resolved* pairing, not just the stored one, and that is
 * the whole point of the screen. Assignees push out as numeric ClickUp member
 * ids matched on email, which quietly does the right thing for most workspaces
 * and quietly does nothing for anyone whose ClickUp seat uses a different
 * address. So every row says which of the three states it is in — pinned by an
 * admin, matched on email, or matching nobody — and the last one is the row this
 * whole feature exists to surface.
 *
 * ClickUp being unreachable is not a failure here. The saved pins are cached
 * with their names for exactly this reason: an admin can still read what the
 * mapping *is* when they can't currently change it.
 */
@Injectable()
export class GetClickUpPeopleUseCase implements IUsecaseExecute<
  { tenantId: string },
  Result<{ people: ClickUpPersonRow[]; members: ClickUpMember[]; membersUnavailable: string }>
> {
  constructor(
    @Inject(IAppSettingsRepository) private readonly repo: IAppSettingsRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    private readonly client: ClickUpClient,
  ) {}

  async execute({
    tenantId,
  }: {
    tenantId: string;
  }): Promise<
    Result<{ people: ClickUpPersonRow[]; members: ClickUpMember[]; membersUnavailable: string }>
  > {
    const settings = await loadOrDefault(this.repo, tenantId);
    const config = settings.clickup;
    if (!config) return Result.fail('ClickUp is not connected');

    let members: ClickUpMember[] = [];
    let membersUnavailable = '';
    try {
      members = await this.client.listWorkspaceMembers(config.apiToken, config.workspaceId);
    } catch (err) {
      membersUnavailable = apiFailure(err);
    }

    // A tenant's whole roster, not a page of it: this is a mapping table, and a
    // person missing from it is a person whose assignments silently don't sync.
    const page = await this.users.findByTenant(
      tenantId,
      Object.assign(new QueryUserDto(), { page: 1, limit: MAX_PEOPLE }),
    );
    const people = page.data
      .map((u) => resolvePerson(u, config.userMap, members))
      .sort((a, b) => a.name.localeCompare(b.name));

    return Result.ok({ people, members, membersUnavailable });
  }
}

/**
 * Replace the people map.
 *
 * Every pinned id is checked against the live roster before it is stored, and a
 * workspace we can't reach fails the save rather than accepting the change. An
 * id that ClickUp doesn't recognise wouldn't error at save time — it would sit
 * there looking configured and then be dropped by the push, which is the exact
 * silent failure this screen was built to end.
 *
 * Rows are stored with the member's name and email alongside the id so the
 * screen can render a saved pin without a round trip; only the id decides
 * anything, and it is re-resolved on the next read.
 */
@Injectable()
export class SaveClickUpPeopleUseCase implements IUsecaseExecute<
  { tenantId: string; pairs: { userId: string; memberId: number }[] },
  Result<AppSettingsEntity>
> {
  constructor(
    @Inject(IAppSettingsRepository) private readonly repo: IAppSettingsRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    private readonly client: ClickUpClient,
  ) {}

  async execute({
    tenantId,
    pairs,
  }: {
    tenantId: string;
    pairs: { userId: string; memberId: number }[];
  }): Promise<Result<AppSettingsEntity>> {
    const settings = await loadOrDefault(this.repo, tenantId);
    const config = settings.clickup;
    if (!config) return Result.fail('ClickUp is not connected');

    // Only rows that pin someone are stored. `memberId: 0` is how the form says
    // "stop overriding this person", and the absence of a row *is* that state —
    // there is no such thing as a stored null pin.
    const wanted = pairs.filter((p) => p.memberId > 0);
    const seen = new Set<string>();
    for (const p of wanted) {
      if (seen.has(p.userId)) return Result.fail('That form maps the same person twice');
      seen.add(p.userId);
    }

    let members: ClickUpMember[];
    try {
      members = await this.client.listWorkspaceMembers(config.apiToken, config.workspaceId);
    } catch (err) {
      return Result.fail(apiFailure(err));
    }

    const userMap: ClickUpUserLink[] = [];
    for (const p of wanted) {
      const user = await this.users.findById(p.userId);
      if (!user || user.tenantId !== tenantId) return Result.fail('Unknown person in that form');
      const member = members.find((m) => m.id === p.memberId);
      if (!member) return Result.fail('That ClickUp member is no longer in this workspace');
      userMap.push({
        userId: p.userId,
        memberId: member.id,
        username: member.username,
        email: member.email,
      });
    }

    settings.setClickUp({ ...config, userMap });
    await this.repo.save(settings);
    return Result.ok(settings);
  }
}

/**
 * Disconnect: delete the webhook in ClickUp, drop the token, drop the links.
 *
 * The links go too. Keeping them would leave rows quoting a status nothing can
 * ever refresh — a mirror with no source is just a stale claim wearing a badge.
 */
@Injectable()
export class DisconnectClickUpUseCase implements IUsecaseExecute<
  { tenantId: string },
  Result<AppSettingsEntity>
> {
  constructor(
    @Inject(IAppSettingsRepository) private readonly repo: IAppSettingsRepository,
    @Inject(IClickUpLinkRepository) private readonly links: IClickUpLinkRepository,
    @Inject(IClickUpSyncRepository) private readonly bindings: IClickUpSyncRepository,
    private readonly client: ClickUpClient,
  ) {}

  async execute({ tenantId }: { tenantId: string }): Promise<Result<AppSettingsEntity>> {
    const settings = await loadOrDefault(this.repo, tenantId);
    const config = settings.clickup;
    if (config?.webhookId && config.apiToken) {
      // Best-effort by contract (see `ClickUpClient.deleteWebhook`): a revoked
      // token must not be able to trap a workspace in a connected state.
      await this.client.deleteWebhook(config.apiToken, config.webhookId);
    }
    await this.links.removeAllForTenant(tenantId);
    // Bindings go too. A list id belongs to the workspace that was connected, so
    // keeping them would mean a *different* ClickUp workspace connected later
    // inherits boards pointed at lists it doesn't have. The ClickUp tasks
    // themselves are left alone — deleting somebody's work is not what
    // "disconnect" asks for.
    await this.bindings.removeAllForTenant(tenantId);
    settings.setClickUp(null);
    await this.repo.save(settings);
    return Result.ok(settings);
  }
}

/** Every ClickUp task linked to one record. */
@Injectable()
export class GetClickUpLinksUseCase implements IUsecaseExecute<
  { tenantId: string; targetType: ClickUpLinkTarget; targetId: string },
  Result<ClickUpLinkRecord[]>
> {
  constructor(@Inject(IClickUpLinkRepository) private readonly links: IClickUpLinkRepository) {}

  async execute({
    tenantId,
    targetType,
    targetId,
  }: {
    tenantId: string;
    targetType: ClickUpLinkTarget;
    targetId: string;
  }): Promise<Result<ClickUpLinkRecord[]>> {
    if (!targetId) return Result.ok([]);
    return Result.ok(await this.links.findForTarget(tenantId, targetType, targetId));
  }
}

/**
 * Link a ClickUp task to an issue or a backlog item.
 *
 * Reads the task straight away rather than storing a bare id and waiting for an
 * event: an admin who pastes the wrong URL should find out now, and the panel
 * should have something to render the moment it appears.
 */
@Injectable()
export class LinkClickUpTaskUseCase implements IUsecaseExecute<
  { tenantId: string; userId: string; userName: string; dto: LinkClickUpTaskDto },
  Result<ClickUpLinkRecord>
> {
  constructor(
    @Inject(IAppSettingsRepository) private readonly settingsRepo: IAppSettingsRepository,
    @Inject(IClickUpLinkRepository) private readonly links: IClickUpLinkRepository,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository,
    private readonly client: ClickUpClient,
  ) {}

  async execute({
    tenantId,
    userId,
    userName,
    dto,
  }: {
    tenantId: string;
    userId: string;
    userName: string;
    dto: LinkClickUpTaskDto;
  }): Promise<Result<ClickUpLinkRecord>> {
    const settings = await this.settingsRepo.findByTenant(tenantId);
    const config = settings?.clickup;
    if (!config) return Result.fail('ClickUp is not connected');

    const ref = parseClickUpTaskRef(dto.reference ?? '');
    if (!ref) return Result.fail('That does not look like a ClickUp task link or id');

    // Confirm the record exists *and* belongs to this tenant before spending a
    // ClickUp call on it — targetId arrives from the client.
    const roadmapId = await this.resolveTarget(tenantId, dto);
    if (roadmapId === null) return Result.fail('That record no longer exists');

    let task: ClickUpTask;
    try {
      task = await this.client.getTask(config.apiToken, ref.id, {
        customId: ref.customId,
        workspaceId: config.workspaceId,
      });
    } catch (err) {
      return Result.fail(apiFailure(err));
    }

    const link = await this.links.create({
      tenantId,
      // ClickUp's own id, never the pasted one: a custom id (`DEV-123`) is not
      // what a webhook delivery names, so storing it would break the reverse
      // lookup that keeps the snapshot fresh.
      clickupTaskId: task.id || ref.id,
      targetType: dto.targetType,
      targetId: dto.targetId,
      roadmapId,
      createdBy: userId,
      createdByName: userName,
      ...snapshotOf(task),
    });
    return Result.ok(link);
  }

  /**
   * Returns the roadmap id to store ('' for an issue), or `null` if the record
   * isn't there. A roadmap item is embedded, so it takes both ids to find one.
   */
  private async resolveTarget(tenantId: string, dto: LinkClickUpTaskDto): Promise<string | null> {
    if (dto.targetType === ClickUpLinkTarget.ISSUE) {
      const issue = await this.issues.findById(dto.targetId);
      return issue && issue.tenantId === tenantId ? '' : null;
    }
    const roadmapId = dto.roadmapId?.trim();
    if (!roadmapId) return null;
    const roadmap = await this.roadmaps.findById(roadmapId);
    if (!roadmap || roadmap.tenantId !== tenantId) return null;
    return roadmap.items.some((i) => i.id === dto.targetId) ? roadmapId : null;
  }
}

/** Whether one record can be created in ClickUp on demand, and where it'd land. */
export interface ClickUpPushTarget {
  canPush: boolean;
  listName: string;
}

/** Which board a record belongs to, in binding terms. */
interface RecordScope {
  scope: ClickUpSyncScope;
  scopeId: string;
}

/**
 * Can this record be pushed into ClickUp right now?
 *
 * Answers `false` rather than failing for every ordinary reason — no ClickUp, an
 * unbound board, a personal task, a record already synced. All of those are the
 * normal state of nearly every issue in nearly every workspace, and a panel
 * asking "should I show a button?" should not have to read error strings to find
 * out that the answer is simply no.
 *
 * It is *not* the guard. `PushClickUpTaskUseCase` re-checks everything and says
 * why in words — this only decides what to draw.
 */
@Injectable()
export class GetClickUpPushTargetUseCase implements IUsecaseExecute<
  { tenantId: string; targetType: ClickUpLinkTarget; targetId: string; roadmapId?: string },
  Result<ClickUpPushTarget>
> {
  constructor(
    @Inject(IAppSettingsRepository) private readonly settingsRepo: IAppSettingsRepository,
    @Inject(IClickUpSyncRepository) private readonly bindings: IClickUpSyncRepository,
    @Inject(IClickUpLinkRepository) private readonly links: IClickUpLinkRepository,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository,
  ) {}

  async execute({
    tenantId,
    targetType,
    targetId,
    roadmapId,
  }: {
    tenantId: string;
    targetType: ClickUpLinkTarget;
    targetId: string;
    roadmapId?: string;
  }): Promise<Result<ClickUpPushTarget>> {
    const no: ClickUpPushTarget = { canPush: false, listName: '' };
    if (!targetId) return Result.ok(no);

    const settings = await this.settingsRepo.findByTenant(tenantId);
    const config = settings?.clickup;
    if (!config?.apiToken || !config.enabled) return Result.ok(no);

    // Already has a task of its own. Pushing again would only re-send fields the
    // board already keeps in step, and "Create in ClickUp" beside a row that says
    // Synced would read as an offer to make a second one.
    const existing = await this.links.findForTarget(tenantId, targetType, targetId);
    if (existing.some((l) => l.origin === ClickUpLinkOrigin.SYNC)) return Result.ok(no);

    const scope = await this.scopeOf(tenantId, targetType, targetId, roadmapId);
    if (!scope) return Result.ok(no);

    const binding = await this.bindings.findForScope(tenantId, scope.scope, scope.scopeId);
    if (!binding?.enabled || !binding.listId) return Result.ok(no);
    return Result.ok({ canPush: true, listName: binding.listName });
  }

  /** The board behind a record, or `null` if it has none we're allowed to push to. */
  private async scopeOf(
    tenantId: string,
    targetType: ClickUpLinkTarget,
    targetId: string,
    roadmapId?: string,
  ): Promise<RecordScope | null> {
    if (targetType === ClickUpLinkTarget.ISSUE) {
      const issue = await this.issues.findById(targetId);
      // A personal task is skipped here for the same reason the automatic push
      // skips it: a private board has no team, and no shared list to leak into.
      if (!issue || issue.tenantId !== tenantId || issue.isPersonal || !issue.teamId) return null;
      return { scope: ClickUpSyncScope.TEAM, scopeId: issue.teamId };
    }
    const id = roadmapId?.trim();
    if (!id) return null;
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return null;
    return roadmap.items.some((i) => i.id === targetId)
      ? { scope: ClickUpSyncScope.ROADMAP, scopeId: id }
      : null;
  }
}

/**
 * Create this record in ClickUp now, through its board's binding.
 *
 * The gap it closes: a board bound today fills in *gradually*, because the push
 * only runs when an issue is saved or moved. Everything that was already sitting
 * there — the backlog nobody has touched since — stays invisible in ClickUp
 * forever, and there was no way to say "that one too" short of opening it and
 * making a meaningless edit.
 *
 * So this is not a third kind of link. It runs the same write the board runs, on
 * the same schedule the board would have used if the issue had been created a
 * day later: one `sync` link, pushed out, status coming back, unlinked only by
 * unbinding the board. The only thing that's new is the trigger.
 */
@Injectable()
export class PushClickUpTaskUseCase implements IUsecaseExecute<
  { tenantId: string; dto: ClickUpTargetDto },
  Result<ClickUpLinkRecord>
> {
  constructor(
    @Inject(IClickUpLinkRepository) private readonly links: IClickUpLinkRepository,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository,
    @Inject(IClickUpSync) private readonly sync: IClickUpSync,
  ) {}

  async execute({
    tenantId,
    dto,
  }: {
    tenantId: string;
    dto: ClickUpTargetDto;
  }): Promise<Result<ClickUpLinkRecord>> {
    let pushed: Result<void>;
    try {
      pushed =
        dto.targetType === ClickUpLinkTarget.ISSUE
          ? await this.pushIssue(tenantId, dto.targetId)
          : await this.pushItem(tenantId, dto.targetId, dto.roadmapId);
    } catch (err) {
      // The port throws only on a ClickUp fault — see `IClickUpSync.pushIssueNow`.
      return Result.fail(
        apiFailure(err, 'ClickUp could not find that list. Rebind the board in its settings.'),
      );
    }
    if (pushed.isFailure) return Result.fail(pushed.error as string);

    // Read the link back rather than having the push return it: the write path is
    // shared with the automatic push, and giving it a return value only this
    // caller reads is how a shared path starts growing branches.
    const all = await this.links.findForTarget(tenantId, dto.targetType, dto.targetId);
    const link = all.find((l) => l.origin === ClickUpLinkOrigin.SYNC);
    return link ? Result.ok(link) : Result.fail('The push went through but no link came back');
  }

  private async pushIssue(tenantId: string, targetId: string): Promise<Result<void>> {
    const issue = await this.issues.findById(targetId);
    if (!issue || issue.tenantId !== tenantId) return Result.fail('That record no longer exists');
    return this.sync.pushIssueNow(issue);
  }

  private async pushItem(
    tenantId: string,
    targetId: string,
    roadmapId?: string,
  ): Promise<Result<void>> {
    const id = roadmapId?.trim();
    if (!id) return Result.fail('That record no longer exists');
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) {
      return Result.fail('That record no longer exists');
    }
    const item = roadmap.items.find((i) => i.id === targetId);
    if (!item) return Result.fail('That record no longer exists');
    return this.sync.pushRoadmapItemNow(tenantId, id, item);
  }
}

/** Drop one link. The ClickUp task itself is untouched — we never write there. */
@Injectable()
export class UnlinkClickUpTaskUseCase implements IUsecaseExecute<
  { tenantId: string; id: string },
  Result<boolean>
> {
  constructor(@Inject(IClickUpLinkRepository) private readonly links: IClickUpLinkRepository) {}

  async execute({ tenantId, id }: { tenantId: string; id: string }): Promise<Result<boolean>> {
    const link = await this.links.findById(tenantId, id);
    if (!link) return Result.fail('Link not found');
    // A synced link isn't this record's to remove — it exists because the whole
    // board is bound, and it's the only thing that knows which ClickUp task this
    // record already owns. Delete it and the next edit mints a *second* task, so
    // "unlink" would quietly mean "duplicate". Unbinding is a board decision, and
    // it's made where the binding was made.
    if (link.origin === ClickUpLinkOrigin.SYNC) {
      return Result.fail(
        'This task is synced from a bound ClickUp list. Unbind the board in its settings to stop syncing.',
      );
    }
    const removed = await this.links.removeById(tenantId, id);
    if (!removed) return Result.fail('Link not found');
    return Result.ok(true);
  }
}

/**
 * Re-read one linked task now.
 *
 * The escape hatch for every way a webhook can fail to arrive: registration was
 * refused, ClickUp couldn't reach this host, a delivery was dropped. Because the
 * handler and this button do the same thing — re-read and re-snapshot — a manual
 * refresh always converges to the same state an event would have produced.
 */
@Injectable()
export class RefreshClickUpLinkUseCase implements IUsecaseExecute<
  { tenantId: string; id: string },
  Result<ClickUpLinkRecord>
> {
  constructor(
    @Inject(IAppSettingsRepository) private readonly settingsRepo: IAppSettingsRepository,
    @Inject(IClickUpLinkRepository) private readonly links: IClickUpLinkRepository,
    private readonly client: ClickUpClient,
  ) {}

  async execute({
    tenantId,
    id,
  }: {
    tenantId: string;
    id: string;
  }): Promise<Result<ClickUpLinkRecord>> {
    const link = await this.links.findById(tenantId, id);
    if (!link) return Result.fail('Link not found');

    const settings = await this.settingsRepo.findByTenant(tenantId);
    const config = settings?.clickup;
    if (!config) return Result.fail('ClickUp is not connected');

    try {
      const task = await this.client.getTask(config.apiToken, link.clickupTaskId, {
        workspaceId: config.workspaceId,
      });
      await this.links.updateSnapshot(tenantId, link.clickupTaskId, snapshotOf(task));
    } catch (err) {
      // A 404 here is information, not a failure: the task is gone. Record that
      // on the link so the panel can say so, and answer ok — the user asked
      // "what's the state of this?", and "deleted in ClickUp" is the answer.
      if (err instanceof ClickUpApiError && (err.status === 404 || err.status === 403)) {
        await this.links.updateSnapshot(tenantId, link.clickupTaskId, {
          ...snapshotFrom(link),
          unavailableReason:
            err.status === 404 ? 'Deleted in ClickUp' : 'No longer visible to this token',
        });
      } else {
        return Result.fail(apiFailure(err));
      }
    }

    const fresh = await this.links.findById(tenantId, id);
    return fresh ? Result.ok(fresh) : Result.fail('Link not found');
  }
}

/** What the receiving controller answers with. */
export interface ClickUpDeliveryResult {
  /** false → 401. The delivery didn't prove it came from ClickUp. */
  authentic: boolean;
  /** How many links we re-stamped (0 is normal — the task may not be linked). */
  updated: number;
  /** Human line stored as `lastEventSummary`, and echoed back to the sender. */
  summary: string;
}

/**
 * Handle one inbound ClickUp delivery.
 *
 * The tenant comes from the URL token and never from the body; the signature
 * proves the sender; and then — whatever the event was — we re-read the task and
 * re-snapshot every link pointing at it. Uniform on purpose: applying ClickUp's
 * `history_items` as a delta would make one dropped delivery a permanent error,
 * where a re-read is idempotent and self-healing.
 *
 * A payload we don't understand is a no-op with a 200. ClickUp disables a webhook
 * that keeps failing, and "sync silently stopped last Tuesday" is a far worse bug
 * than "we ignored an event we had nothing to say about".
 */
@Injectable()
export class ReceiveClickUpEventUseCase {
  private readonly logger = new Logger(ReceiveClickUpEventUseCase.name);

  constructor(
    @Inject(IAppSettingsRepository) private readonly settingsRepo: IAppSettingsRepository,
    @Inject(IClickUpLinkRepository) private readonly links: IClickUpLinkRepository,
    @Inject(IClickUpSyncRepository) private readonly bindings: IClickUpSyncRepository,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository,
    private readonly client: ClickUpClient,
  ) {}

  async execute(input: {
    token: string;
    headers: Record<string, string | string[] | undefined>;
    rawBody: Buffer | undefined;
    body: unknown;
  }): Promise<Result<ClickUpDeliveryResult>> {
    const settings = await this.settingsRepo.findByClickUpToken(input.token);
    const config = settings?.clickup;
    // An unknown token and a disabled integration answer identically, so neither
    // reveals whether the workspace exists.
    if (!settings || !config || !config.enabled) {
      return Result.ok({ authentic: false, updated: 0, summary: 'unknown endpoint' });
    }

    if (!verifyClickUpSignature(config.webhookSecret, input.headers, input.rawBody)) {
      this.logger.warn(`Rejected an unsigned ClickUp delivery for tenant ${settings.tenantId}`);
      return Result.ok({ authentic: false, updated: 0, summary: 'bad signature' });
    }

    const event = parseClickUpEvent(input.body);
    if (!event) return Result.ok({ authentic: true, updated: 0, summary: 'ignored event' });

    const tenantId = settings.tenantId;
    const existing = await this.links.findByTaskId(tenantId, event.taskId);
    // Authentic, but about a task nobody here linked. Nothing to do, and not
    // worth writing a delivery summary about.
    if (!existing.length) {
      return Result.ok({ authentic: true, updated: 0, summary: 'no linked record' });
    }

    let updated = 0;
    let summary: string;
    if (event.deleted) {
      updated = await this.links.updateSnapshot(tenantId, event.taskId, {
        ...snapshotFrom(existing[0]),
        unavailableReason: 'Deleted in ClickUp',
      });
      summary = `${existing[0].taskName || event.taskId} · deleted in ClickUp`;
    } else {
      try {
        const task = await this.client.getTask(config.apiToken, event.taskId, {
          workspaceId: config.workspaceId,
        });
        updated = await this.links.updateSnapshot(tenantId, event.taskId, snapshotOf(task));
        // The inbound half of the two-way status rule. Everything above this line
        // only touches the mirror; this is the one place a ClickUp change is
        // allowed to move something on a board here.
        const moved = await this.applyInboundStatus(tenantId, existing, task.status);
        summary = [
          `${task.name} · ${task.status || 'no status'} · ${updated} link${updated === 1 ? '' : 's'} updated`,
          moved ? `${moved} moved here` : '',
        ]
          .filter(Boolean)
          .join(' · ');
      } catch (err) {
        // The read failed, but the delivery was genuine. Say so in the summary
        // and answer 200: retrying this event would re-read the same broken
        // thing, and the admin needs to see *why* it stopped.
        summary = `${existing[0].taskName || event.taskId} · ${apiFailure(err)}`;
        this.logger.warn(`ClickUp re-read failed for ${event.taskId}: ${summary}`);
      }
    }

    settings.recordClickUpDelivery(summary);
    await this.settingsRepo.save(settings);
    return Result.ok({ authentic: true, updated, summary });
  }

  /**
   * Move the records behind these links into the column their bound list's
   * status maps to. Returns how many actually moved.
   *
   * Four gates, and every one of them is load-bearing:
   *
   * 1. **Synced links only.** A pasted link is a mirror and stays one — nobody
   *    gets to move a card on this board by editing a task in a list we were
   *    only ever shown.
   * 2. **Not our own echo.** Pushing a status makes ClickUp fire
   *    `taskStatusUpdated` straight back at us. Without this, that delivery reads
   *    as "someone moved the card in ClickUp" and we re-apply our own change as
   *    if it were theirs — harmless once, and a loop the moment anything on the
   *    way back differs. Compared against what we recorded sending, so there's no
   *    debounce window to tune and no clock to skew.
   * 3. **A mapped status.** An unmapped ClickUp status leaves the card where it
   *    is. A board that stays put is honest; one that guesses is not.
   * 4. **Actually different.** ClickUp fires on edits we don't mirror at all
   *    (a comment, a tag), so most deliveries arrive with the status unchanged.
   */
  private async applyInboundStatus(
    tenantId: string,
    links: ClickUpLinkRecord[],
    clickupStatus: string,
  ): Promise<number> {
    if (!clickupStatus) return 0;
    let moved = 0;

    for (const link of links) {
      if (link.origin !== ClickUpLinkOrigin.SYNC) continue;
      if (link.pushedStatus && sameStatus(link.pushedStatus, clickupStatus)) continue;

      try {
        if (link.targetType === ClickUpLinkTarget.ISSUE) {
          const issue = await this.issues.findById(link.targetId);
          if (!issue || issue.tenantId !== tenantId || !issue.teamId) continue;
          const binding = await this.bindings.findForScope(
            tenantId,
            ClickUpSyncScope.TEAM,
            issue.teamId,
          );
          if (!binding?.enabled) continue;
          const wanted = ourStatusFor(binding.statusMap, clickupStatus);
          if (!wanted || wanted === issue.status) continue;
          issue.setStatus(wanted);
          await this.issues.update(issue);
        } else {
          const roadmap = await this.roadmaps.findById(link.roadmapId);
          if (!roadmap || roadmap.tenantId !== tenantId) continue;
          const binding = await this.bindings.findForScope(
            tenantId,
            ClickUpSyncScope.ROADMAP,
            link.roadmapId,
          );
          if (!binding?.enabled) continue;
          const wanted = ourStatusFor(binding.statusMap, clickupStatus);
          const item = roadmap.items.find((i) => i.id === link.targetId);
          if (!wanted || !item || item.phase === wanted) continue;
          // Items are embedded, so moving one is a rewrite of the array with
          // that item's `phase` changed and everything else left exactly as it
          // was — this is a status move, not an edit of the item.
          roadmap.replaceItems(
            roadmap.items.map((i) => (i.id === item.id ? { ...i, phase: wanted } : i)),
          );
          await this.roadmaps.update(roadmap);
        }
        // Remember what the record now agrees with, so our own next push isn't
        // mistaken for a change coming the other way.
        await this.links.markPushed(tenantId, link.id, clickupStatus);
        moved += 1;
      } catch (err) {
        // One unmovable record must not fail the delivery — the other links on
        // this task, and the mirror update that already succeeded, still stand.
        this.logger.warn(
          `ClickUp inbound status failed for link ${link.id}: ${(err as Error).message}`,
        );
      }
    }
    return moved;
  }
}

/** ClickUp reports statuses lowercased whatever the list defines them as. */
function sameStatus(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
