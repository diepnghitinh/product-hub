import { Inject, Injectable, Logger } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { shareToken } from '@module-shared/utils/short-id.util';
import { AppSettingsEntity } from '@application/app-settings/domain/app-settings.entity';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import { IRoadmapRepository } from '@application/roadmaps/repositories/roadmap.repository';
import {
  ClickUpConfig,
  ClickUpLinkTarget,
  newClickUpDefaults,
} from '@application/app-settings/domain/clickup.types';
import {
  ClickUpLinkRecord,
  ClickUpTaskSnapshot,
  IClickUpLinkRepository,
} from '../repositories/clickup-link.repository';
import {
  ClickUpApiError,
  ClickUpClient,
  ClickUpTask,
  ClickUpWorkspace,
} from '../domain/clickup.client';
import {
  parseClickUpEvent,
  parseClickUpTaskRef,
  verifyClickUpSignature,
} from '../domain/clickup-event.parser';
import { ConnectClickUpDto, LinkClickUpTaskDto, ProbeClickUpDto } from '../dtos/clickup.dtos';

/**
 * ClickUp, end to end.
 *
 * Three rules run through every use-case below, because they're the product
 * decisions this feature was built on:
 *
 * 1. **Mirror only.** Nothing here writes a product-os issue's status, phase or
 *    assignee from ClickUp. A ClickUp status lands in the link's snapshot and is
 *    rendered *beside* the record. This workspace stays the author of its board.
 * 2. **One way.** Nothing here writes to ClickUp either, apart from registering
 *    and deleting our own webhook. A bug on our side cannot corrupt a customer's
 *    ClickUp workspace.
 * 3. **The token never leaves.** It is loaded from settings inside these
 *    use-cases and handed straight to `ClickUpClient`. No response DTO carries it.
 */

async function loadOrDefault(
  repo: IAppSettingsRepository,
  tenantId: string,
): Promise<AppSettingsEntity> {
  return (await repo.findByTenant(tenantId)) ?? AppSettingsEntity.create({ tenantId }).getValue();
}

/** Turn a ClickUp API failure into a sentence an admin can act on. */
function apiFailure(err: unknown): string {
  if (err instanceof ClickUpApiError) {
    if (err.status === 401) return 'ClickUp rejected that token. Check it and try again.';
    if (err.status === 403) return 'That token cannot access this workspace.';
    if (err.status === 404) return 'ClickUp could not find that task.';
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

/** Drop one link. The ClickUp task itself is untouched — we never write there. */
@Injectable()
export class UnlinkClickUpTaskUseCase implements IUsecaseExecute<
  { tenantId: string; id: string },
  Result<boolean>
> {
  constructor(@Inject(IClickUpLinkRepository) private readonly links: IClickUpLinkRepository) {}

  async execute({ tenantId, id }: { tenantId: string; id: string }): Promise<Result<boolean>> {
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
        summary = `${task.name} · ${task.status || 'no status'} · ${updated} link${updated === 1 ? '' : 's'} updated`;
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
}
