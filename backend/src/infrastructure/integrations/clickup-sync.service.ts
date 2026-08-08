import { Injectable, Logger } from '@nestjs/common';
import { Result } from '@shared/logic/result';
import {
  ClickUpConfig,
  ClickUpLinkOrigin,
  ClickUpLinkTarget,
  ClickUpSyncScope,
  ClickUpUserLink,
} from '@application/app-settings/domain/clickup.types';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import { IClickUpSync } from '@application/integrations/clickup-sync.port';
import {
  ClickUpClient,
  ClickUpMember,
  ClickUpTaskInput,
  toClickUpDate,
} from '@application/integrations/domain/clickup.client';
import { clickupStatusFor } from '@application/integrations/domain/clickup-status-map';
import {
  ClickUpLinkRecord,
  ClickUpTaskSnapshot,
  IClickUpLinkRepository,
} from '@application/integrations/repositories/clickup-link.repository';
import {
  ClickUpSyncBinding,
  IClickUpSyncRepository,
} from '@application/integrations/repositories/clickup-sync.repository';
import { IssueEntity } from '@application/issues/domain/entities/issue.entity';
import { BugSeverity, IssueKind } from '@application/issues/domain/enums/issue.enums';
import { RoadmapItemData } from '@application/roadmaps/domain/types/roadmap-item.type';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { plainTextBlocks } from '@module-shared/utils/plain-text.util';

/**
 * Our severity → ClickUp's fixed priority scale (1 urgent … 4 low).
 *
 * Only bugs have one. A task has no priority field here, so nothing is sent for
 * one and ClickUp keeps whatever it has — the same "omitted means untouched"
 * rule the status map follows. Backlog items are the same story: RICE is a
 * ranking, not a four-bucket priority, and squashing it into one would be a
 * guess presented as a fact.
 */
const PRIORITY_BY_SEVERITY: Record<BugSeverity, number> = {
  [BugSeverity.CRITICAL]: 1,
  [BugSeverity.HIGH]: 2,
  [BugSeverity.MEDIUM]: 3,
  [BugSeverity.LOW]: 4,
};

/**
 * How long a list's member roster is reused before we re-read it.
 *
 * Assignees travel as ClickUp member ids and nothing here holds one, so every
 * push would otherwise cost an extra API call to look the roster up. People join
 * a list about as often as they join a company, and the cost of being a minute
 * stale is that one just-invited person isn't assignable for a minute — so a
 * short cache is the right trade, and a long one isn't.
 */
const MEMBER_CACHE_MS = 60_000;

/**
 * Pushes work out to a bound ClickUp list.
 *
 * Lives in `infrastructure` while its port lives in `application` for the same
 * reason `WebhookNotifier` does: the application integrations module already
 * imports the issues module, so issues can't import it back. The port breaks the
 * cycle.
 *
 * **Nothing in here is allowed to fail loudly.** Every public method is wrapped
 * so a ClickUp outage, a revoked token or a deleted list can never turn into an
 * error on someone saving an issue. The push is a mirror; the record is the work.
 */
@Injectable()
export class ClickUpSyncService extends IClickUpSync {
  private readonly logger = new Logger(ClickUpSyncService.name);
  /** listId → roster, with the moment it goes stale. See {@link MEMBER_CACHE_MS}. */
  private readonly memberCache = new Map<string, { at: number; members: ClickUpMember[] }>();

  constructor(
    private readonly settings: IAppSettingsRepository,
    private readonly sync: IClickUpSyncRepository,
    private readonly links: IClickUpLinkRepository,
    private readonly users: IUserRepository,
    private readonly client: ClickUpClient,
  ) {
    super();
  }

  async issueCreated(issue: IssueEntity): Promise<void> {
    await this.safely('issueCreated', issue.shortId, () => this.pushIssue(issue));
  }

  async issueChanged(issue: IssueEntity): Promise<void> {
    await this.safely('issueChanged', issue.shortId, () => this.pushIssue(issue));
  }

  async roadmapItemsChanged(
    tenantId: string,
    roadmapId: string,
    items: RoadmapItemData[],
  ): Promise<void> {
    if (!items.length) return;
    await this.safely('roadmapItemsChanged', roadmapId, async () => {
      const ctx = await this.contextFor(tenantId, ClickUpSyncScope.ROADMAP, roadmapId);
      if (!ctx) return;
      // Sequential on purpose. A drag can touch a dozen items at once, and firing
      // a dozen concurrent writes at ClickUp is the fastest way to meet its rate
      // limiter — which answers 429 for *all* of them, not just the excess.
      for (const item of items) {
        await this.pushRoadmapItem(ctx, roadmapId, item);
      }
    });
  }

  // ── on demand ───────────────────────────────────────────────────────────────

  async pushIssueNow(issue: IssueEntity): Promise<Result<void>> {
    if (issue.isPersonal || !issue.teamId) {
      return Result.fail('A personal task has no team board, so there is nothing to sync it to.');
    }
    const ctx = await this.contextFor(issue.tenantId, ClickUpSyncScope.TEAM, issue.teamId);
    if (!ctx) {
      return Result.fail(
        await this.whyNotBound(issue.tenantId, ClickUpSyncScope.TEAM, issue.teamId),
      );
    }
    // Deliberately not wrapped in `safely`: this one throws. See `IClickUpSync`.
    await this.pushIssueTo(ctx, issue);
    return Result.ok();
  }

  async pushRoadmapItemNow(
    tenantId: string,
    roadmapId: string,
    item: RoadmapItemData,
  ): Promise<Result<void>> {
    const ctx = await this.contextFor(tenantId, ClickUpSyncScope.ROADMAP, roadmapId);
    if (!ctx) {
      return Result.fail(await this.whyNotBound(tenantId, ClickUpSyncScope.ROADMAP, roadmapId));
    }
    await this.pushRoadmapItem(ctx, roadmapId, item);
    return Result.ok();
  }

  /**
   * Which of the three "nowhere to push to" answers this is.
   *
   * Only ever runs when {@link contextFor} already said no, so the extra reads
   * cost nothing on the path that works. Worth the two of them: "not connected",
   * "paused" and "this board isn't bound" send an admin to three different
   * screens, and one shrug for all three sends them to none.
   */
  private async whyNotBound(
    tenantId: string,
    scope: ClickUpSyncScope,
    scopeId: string,
  ): Promise<string> {
    const settings = await this.settings.findByTenant(tenantId);
    const config = settings?.clickup;
    if (!config?.apiToken) return 'ClickUp is not connected.';
    if (!config.enabled) return 'The ClickUp integration is paused.';
    const binding = await this.sync.findForScope(tenantId, scope, scopeId);
    if (!binding?.listId) return 'This board is not connected to a ClickUp list.';
    return 'Syncing is turned off for this board.';
  }

  // ── the two push paths ──────────────────────────────────────────────────────

  private async pushIssue(issue: IssueEntity): Promise<void> {
    // A personal task has no team, so it has no binding — and pushing someone's
    // private board into a shared ClickUp workspace would be a leak, not a
    // feature. The `teamId` guard says the same thing twice on purpose.
    if (issue.isPersonal || !issue.teamId) return;

    const ctx = await this.contextFor(issue.tenantId, ClickUpSyncScope.TEAM, issue.teamId);
    if (!ctx) return;

    await this.pushIssueTo(ctx, issue);
  }

  /** The write itself, once the board is known to be bound. */
  private async pushIssueTo(ctx: SyncContext, issue: IssueEntity): Promise<void> {
    const link = await this.syncLinkFor(
      issue.tenantId,
      ClickUpLinkTarget.ISSUE,
      issue.id.toString(),
    );
    const assigneeIds = issue.assignees.length
      ? issue.assignees.map((a) => a.id)
      : issue.assigneeId
        ? [issue.assigneeId]
        : [];

    const input: ClickUpTaskInput = {
      name: issue.title,
      description: plainTextBlocks(issue.description),
      status: clickupStatusFor(ctx.binding.statusMap, issue.status) || undefined,
      startDate: toClickUpDate(issue.startDate),
      dueDate: toClickUpDate(issue.endDate),
      ...(issue.kind === IssueKind.BUG && issue.severity
        ? { priority: PRIORITY_BY_SEVERITY[issue.severity] }
        : {}),
    };

    await this.write(ctx, link, input, assigneeIds, {
      targetType: ClickUpLinkTarget.ISSUE,
      targetId: issue.id.toString(),
      roadmapId: '',
      createdBy: issue.createdBy,
      createdByName: issue.createdByName,
    });
  }

  private async pushRoadmapItem(
    ctx: SyncContext,
    roadmapId: string,
    item: RoadmapItemData,
  ): Promise<void> {
    const link = await this.syncLinkFor(ctx.tenantId, ClickUpLinkTarget.ROADMAP_ITEM, item.id);
    const input: ClickUpTaskInput = {
      name: item.title,
      description: plainTextBlocks(item.description),
      // A backlog item's column is its `phase` — the same thing a team's status
      // is, under a different name, which is why one map shape serves both.
      status: clickupStatusFor(ctx.binding.statusMap, item.phase) || undefined,
      startDate: toClickUpDate(item.startDate),
      dueDate: toClickUpDate(item.endDate),
    };

    await this.write(
      ctx,
      link,
      input,
      item.assignees.map((a) => a.id),
      {
        targetType: ClickUpLinkTarget.ROADMAP_ITEM,
        targetId: item.id,
        roadmapId,
        createdBy: '',
        createdByName: '',
      },
    );
  }

  // ── the shared write ────────────────────────────────────────────────────────

  /** Create the ClickUp task or update it, then re-stamp our mirror of it. */
  private async write(
    ctx: SyncContext,
    link: ClickUpLinkRecord | null,
    input: ClickUpTaskInput,
    ourAssigneeIds: string[],
    target: {
      targetType: ClickUpLinkTarget;
      targetId: string;
      roadmapId: string;
      createdBy: string;
      createdByName: string;
    },
  ): Promise<void> {
    const members = await this.membersOf(ctx);
    const wanted = await this.clickUpIdsFor(
      ctx.tenantId,
      ourAssigneeIds,
      members,
      ctx.config.userMap,
    );

    if (!link) {
      const task = await this.client.createTask(ctx.config.apiToken, ctx.binding.listId, {
        ...input,
        assignees: wanted,
      });
      const created = await this.links.create({
        tenantId: ctx.tenantId,
        clickupTaskId: task.id,
        ...target,
        origin: ClickUpLinkOrigin.SYNC,
        ...snapshotOfTask(task),
      });
      await this.links.markPushed(ctx.tenantId, created.id, task.status);
      return;
    }

    // Who's on the ClickUp task now, so we can say who should come off. The
    // mirror stores whatever ClickUp shows a person as (username, else email),
    // so match on both — see `ClickUpClient.listMembers`.
    const current = link.assignees
      .map((name) => {
        const wantedName = name.toLowerCase();
        return members.find(
          (m) => m.username.toLowerCase() === wantedName || m.email === wantedName,
        )?.id;
      })
      .filter((id): id is number => typeof id === 'number');

    await this.client.updateTask(ctx.config.apiToken, link.clickupTaskId, {
      ...input,
      assignees: wanted.filter((id) => !current.includes(id)),
      unassignees: current.filter((id) => !wanted.includes(id)),
    });

    // Update the mirror from what we just wrote rather than re-reading the task.
    // ClickUp's update endpoint doesn't answer with the full task, so a truthful
    // mirror would cost a second round trip on every save — and the webhook is
    // about to re-snapshot this anyway. Only the fields we actually sent move;
    // everything else keeps the value it had.
    await this.links.updateSnapshot(ctx.tenantId, link.clickupTaskId, {
      ...toSnapshot(link),
      taskName: input.name ?? link.taskName,
      status: input.status ?? link.status,
      assignees: wanted
        .map((id) => members.find((m) => m.id === id))
        .map((m) => m?.username || m?.email || '')
        .filter(Boolean),
      dueDate: isoOf(input.dueDate) ?? link.dueDate,
      unavailableReason: '',
    });
    if (input.status) await this.links.markPushed(ctx.tenantId, link.id, input.status);
  }

  // ── lookups ─────────────────────────────────────────────────────────────────

  /**
   * Everything a push needs, or `null` when this board doesn't sync — which is
   * the overwhelmingly common answer and the reason this is one cheap function:
   * most workspaces have no ClickUp at all, and they pay two indexed reads.
   */
  private async contextFor(
    tenantId: string,
    scope: ClickUpSyncScope,
    scopeId: string,
  ): Promise<SyncContext | null> {
    const settings = await this.settings.findByTenant(tenantId);
    const config = settings?.clickup;
    if (!config?.enabled || !config.apiToken) return null;

    const binding = await this.sync.findForScope(tenantId, scope, scopeId);
    if (!binding?.enabled || !binding.listId) return null;

    return { tenantId, config, binding };
  }

  /**
   * The existing link for a record — but only a {@link ClickUpLinkOrigin.SYNC}
   * one.
   *
   * A record can carry both: a task somebody pasted in *and* the one its bound
   * board created. Filtering here is what keeps the pasted one read-only, which
   * is the promise this workspace was already given before boards could be bound.
   */
  private async syncLinkFor(
    tenantId: string,
    targetType: ClickUpLinkTarget,
    targetId: string,
  ): Promise<ClickUpLinkRecord | null> {
    const all = await this.links.findForTarget(tenantId, targetType, targetId);
    return all.find((l) => l.origin === ClickUpLinkOrigin.SYNC) ?? null;
  }

  private async membersOf(ctx: SyncContext): Promise<ClickUpMember[]> {
    const hit = this.memberCache.get(ctx.binding.listId);
    if (hit && Date.now() - hit.at < MEMBER_CACHE_MS) return hit.members;
    const members = await this.client.listMembers(ctx.config.apiToken, ctx.binding.listId);
    this.memberCache.set(ctx.binding.listId, { at: Date.now(), members });
    return members;
  }

  /**
   * Our people → ClickUp member ids: the explicit map first, then email.
   *
   * Email is the only identifier the two systems share, so it carries the common
   * case with no configuration at all. It breaks the moment somebody's ClickUp
   * seat uses a different address, which is why an admin can pin a pairing in
   * Settings → External tools → ClickUp; a pinned row wins outright and is never
   * second-guessed against the email.
   *
   * Both answers are then filtered against `members`, the roster of who can be
   * assigned in *this list*. That filter is not politeness: assignees ride along
   * in the same request as the title, status and dates, so posting an id ClickUp
   * rejects would lose the whole push, not just the assignee. Somebody with no
   * seat, or no access to this list, is dropped quietly — syncing an issue to the
   * two assignees who do have access beats refusing it because a third doesn't.
   */
  private async clickUpIdsFor(
    tenantId: string,
    userIds: string[],
    members: ClickUpMember[],
    userMap: ClickUpUserLink[],
  ): Promise<number[]> {
    if (!userIds.length || !members.length) return [];
    const found: number[] = [];
    for (const id of userIds) {
      const user = await this.users.findById(id);
      // Another tenant's id can't reach here, but check rather than assume — this
      // resolves an id straight into a call to an external system.
      if (!user || user.tenantId !== tenantId) continue;
      const pinned = userMap.find((p) => p.userId === id)?.memberId;
      const member = pinned
        ? members.find((m) => m.id === pinned)
        : members.find((m) => m.email && m.email === user.email.toLowerCase());
      if (member && !found.includes(member.id)) found.push(member.id);
    }
    return found;
  }

  /** Run a push, swallowing anything it throws. See the class doc. */
  private async safely(what: string, subject: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      this.logger.warn(`ClickUp ${what} failed for ${subject}: ${(err as Error).message}`);
    }
  }
}

/** The three things every push needs, resolved once. */
interface SyncContext {
  tenantId: string;
  config: ClickUpConfig;
  binding: ClickUpSyncBinding;
}

/** Epoch ms back to our ISO day, or `undefined` when nothing was sent. */
function isoOf(epochMs: number | null | undefined): string | undefined {
  if (epochMs === undefined) return undefined;
  if (epochMs === null) return '';
  return new Date(epochMs).toISOString().slice(0, 10);
}

/** The mirrored fields of an existing link, as a snapshot to amend. */
function toSnapshot(link: ClickUpLinkRecord): ClickUpTaskSnapshot {
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

/** A freshly created ClickUp task, as the snapshot we store beside the record. */
function snapshotOfTask(task: {
  name: string;
  url: string;
  customId: string;
  status: string;
  statusColor: string;
  statusType: ClickUpTaskSnapshot['statusType'];
  assignees: string[];
  priority: string;
  dueDate: string;
  listName: string;
  spaceName: string;
}): ClickUpTaskSnapshot {
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
