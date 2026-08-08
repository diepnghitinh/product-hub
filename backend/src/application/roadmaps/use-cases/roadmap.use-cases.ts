import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { randomRef } from '@module-shared/utils/short-id.util';
import { sanitizeStoredFiles } from '@application/storage/domain/stored-file.type';
import { IClickUpSync } from '@application/integrations/clickup-sync.port';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import {
  CreateRoadmapDto,
  ReplaceRoadmapColumnsDto,
  ReplaceRoadmapEpicsDto,
  ReplaceRoadmapItemsDto,
  UpdateRoadmapDto,
} from '../dtos/roadmap.dtos';
import { RoadmapEntity } from '../domain/entities/roadmap.entity';
import { RoadmapDifficulty, RoadmapItemStatus } from '../domain/enums/roadmap.enums';
import {
  DEFAULT_ROADMAP_COLUMNS,
  ROADMAP_ITEM_REF_PREFIX,
  RoadmapEpic,
  RoadmapItemData,
} from '../domain/types/roadmap-item.type';
import { IRoadmapRepository } from '../repositories/roadmap.repository';

/**
 * A fresh `RM-…` ref that no item in this roadmap already holds. Items live
 * embedded in the roadmap document, so "unique" is checked in memory against the
 * set of refs in play rather than against an index — a collision inside one
 * roadmap is what would actually break a URL. 31^7 ≈ 27.5 billion, so the retry
 * loop is a formality; the widened suffix is the backstop if it somehow isn't.
 */
function mintItemRef(taken: Set<string>): string {
  for (let i = 0; i < 5; i++) {
    const ref = randomRef(ROADMAP_ITEM_REF_PREFIX);
    if (!taken.has(ref)) {
      taken.add(ref);
      return ref;
    }
  }
  const ref = `${ROADMAP_ITEM_REF_PREFIX}-${uuid().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  taken.add(ref);
  return ref;
}

@Injectable()
export class CreateRoadmapUseCase
  implements IUsecaseExecute<{ tenantId: string; dto: CreateRoadmapDto }, Result<RoadmapEntity>>
{
  constructor(@Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository) {}
  async execute({
    tenantId,
    dto,
  }: {
    tenantId: string;
    dto: CreateRoadmapDto;
  }): Promise<Result<RoadmapEntity>> {
    const created = RoadmapEntity.create({
      tenantId,
      title: dto.title,
      description: dto.description,
      projectId: dto.projectId,
    });
    if (created.isFailure) return Result.fail(created.error as string);
    const roadmap = created.getValue();
    await this.roadmaps.save(roadmap);
    return Result.ok(roadmap);
  }
}

@Injectable()
export class GetRoadmapsUseCase
  implements IUsecaseExecute<{ tenantId: string }, Result<RoadmapEntity[]>>
{
  constructor(@Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository) {}
  async execute({ tenantId }: { tenantId: string }): Promise<Result<RoadmapEntity[]>> {
    return Result.ok(await this.roadmaps.findByTenant(tenantId));
  }
}

@Injectable()
export class GetRoadmapUseCase
  implements IUsecaseExecute<{ id: string; tenantId: string }, Result<RoadmapEntity>>
{
  constructor(@Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository) {}
  async execute({
    id,
    tenantId,
  }: {
    id: string;
    tenantId: string;
  }): Promise<Result<RoadmapEntity>> {
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');
    return Result.ok(roadmap);
  }
}

@Injectable()
export class UpdateRoadmapUseCase
  implements
    IUsecaseExecute<{ id: string; tenantId: string; dto: UpdateRoadmapDto }, Result<RoadmapEntity>>
{
  constructor(@Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository) {}
  async execute({
    id,
    tenantId,
    dto,
  }: {
    id: string;
    tenantId: string;
    dto: UpdateRoadmapDto;
  }): Promise<Result<RoadmapEntity>> {
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');
    roadmap.applyMeta(dto);
    await this.roadmaps.update(roadmap);
    return Result.ok(roadmap);
  }
}

@Injectable()
export class ReplaceRoadmapItemsUseCase
  implements
    IUsecaseExecute<
      { id: string; tenantId: string; dto: ReplaceRoadmapItemsDto },
      Result<RoadmapEntity>
    >
{
  constructor(
    @Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository,
    @Inject(IClickUpSync) private readonly clickup: IClickUpSync,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
  ) {}
  async execute({
    id,
    tenantId,
    dto,
  }: {
    id: string;
    tenantId: string;
    dto: ReplaceRoadmapItemsDto;
  }): Promise<Result<RoadmapEntity>> {
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');
    // The client replaces the whole array on every edit/drag, so createdAt is
    // stamped and preserved here rather than trusted from the request: keep an
    // existing item's original date (matched by id), and give brand-new items —
    // or legacy ones that never had one — a timestamp now.
    const existingById = new Map(roadmap.items.map((item) => [item.id, item]));
    // Refs are server-owned for the same reason: an item keeps the ref it was
    // minted with (so a link handed out stays valid), a new one gets a fresh
    // ref, and whatever the client sent is ignored — it can't rename a URL.
    const takenRefs = new Set(
      roadmap.items.map((item) => item.shortId).filter((ref): ref is string => !!ref),
    );
    // An item may only point at an epic this roadmap actually has. Anything else
    // is dropped to '' (ungrouped) rather than stored: an unresolvable epicId
    // would hide the item from every grouped view with nothing to show for it.
    const liveEpics = new Set(roadmap.epics.map((e) => e.id));
    const now = new Date().toISOString();
    const items = dto.items.map((item) => {
      const prev = existingById.get(item.id);
      // Timing is driven by the item's status: "started" the first time it reaches
      // In progress (or jumps straight to Done), "completed" the first time it's
      // Done. The first stamp wins and is preserved thereafter, so toggling the
      // status later never moves the clock — and a client can't backdate it.
      const isStarted =
        item.status === RoadmapItemStatus.IN_PROGRESS || item.status === RoadmapItemStatus.DONE;
      const isCompleted = item.status === RoadmapItemStatus.DONE;
      return {
        ...item,
        shortId: prev?.shortId ?? mintItemRef(takenRefs),
        epicId: item.epicId && liveEpics.has(item.epicId) ? item.epicId : '',
        // Items are free-form objects on the wire (the whole array is replaced
        // on every edit), so this is the only place an attachment's URL is
        // checked before it's stored and later rendered as a link.
        attachments: sanitizeStoredFiles(item.attachments),
        createdAt: prev?.createdAt ?? item.createdAt ?? now,
        startedAt: prev?.startedAt ?? (isStarted ? now : undefined),
        completedAt: prev?.completedAt ?? (isCompleted ? now : undefined),
      };
    });
    roadmap.replaceItems(items);
    await this.roadmaps.update(roadmap);
    // Detach after the update: an item missing from the new array was deleted on
    // the board. Any issue still linked to it would otherwise point at a backlog
    // item that no longer resolves to anything — same after-the-fact ordering as
    // the cycle cascade, for the same reason (worst case it reads as unlinked).
    const nextIds = new Set(items.map((item) => item.id));
    const removedIds = [...existingById.keys()].filter((itemId) => !nextIds.has(itemId));
    if (removedIds.length) await this.issues.clearRoadmapItemIds(tenantId, removedIds);
    // Only the items whose *synced* fields actually moved. The board replaces the
    // whole array on every edit, so without this a single drag — which rewrites
    // every item's order — would fire one ClickUp write per backlog item and hit
    // the rate limiter for a change to one card.
    await this.clickup.roadmapItemsChanged(
      tenantId,
      id,
      items.filter((item) => differsForSync(existingById.get(item.id), item)),
    );
    return Result.ok(roadmap);
  }
}

/**
 * Did anything ClickUp mirrors change on this item?
 *
 * A brand-new item (`prev` undefined) always counts — that's what mints its
 * ClickUp task. Everything not listed here (RICE, progress, epic, order, OKR
 * link) is deliberately absent: it isn't pushed, so changing it isn't a reason
 * to call ClickUp.
 */
function differsForSync(prev: RoadmapItemData | undefined, next: RoadmapItemData): boolean {
  if (!prev) return true;
  return (
    prev.title !== next.title ||
    prev.description !== next.description ||
    prev.phase !== next.phase ||
    prev.startDate !== next.startDate ||
    prev.endDate !== next.endDate ||
    prev.assignees.map((a) => a.id).join(',') !== next.assignees.map((a) => a.id).join(',')
  );
}

export interface AddRoadmapItemRequest {
  id: string;
  tenantId: string;
  item: Partial<Omit<RoadmapItemData, 'id'>> & { title: string };
}

/**
 * Appends one item. The board edits by replacing the whole array (it holds the
 * current list in memory), but a caller that only knows "add this" — MCP — must
 * not have to read, splice and write back: two of those racing would drop an
 * item. This appends server-side instead, so concurrent adds both survive.
 */
@Injectable()
export class AddRoadmapItemUseCase
  implements
    IUsecaseExecute<AddRoadmapItemRequest, Result<{ roadmap: RoadmapEntity; item: RoadmapItemData }>>
{
  constructor(
    @Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository,
    @Inject(IClickUpSync) private readonly clickup: IClickUpSync,
  ) {}
  async execute({
    id,
    tenantId,
    item,
  }: AddRoadmapItemRequest): Promise<Result<{ roadmap: RoadmapEntity; item: RoadmapItemData }>> {
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');

    const columns = roadmap.columns.length ? roadmap.columns : DEFAULT_ROADMAP_COLUMNS;
    const phase = item.phase || columns[0].key;
    if (!columns.some((c) => c.key === phase)) {
      return Result.fail(
        `Unknown column "${phase}". This roadmap has: ${columns.map((c) => c.key).join(', ')}`,
      );
    }

    const status = item.status ?? RoadmapItemStatus.IDEA;
    const isStarted =
      status === RoadmapItemStatus.IN_PROGRESS || status === RoadmapItemStatus.DONE;
    const now = new Date().toISOString();
    // Same RICE defaults the board's own "+ Add" uses (3s → a score of 9), so an
    // item added here sorts alongside hand-made ones instead of at zero.
    const created: RoadmapItemData = {
      id: uuid(),
      shortId: mintItemRef(
        new Set(roadmap.items.map((i) => i.shortId).filter((ref): ref is string => !!ref)),
      ),
      title: item.title,
      description: item.description ?? '',
      phase,
      // Same rule as the bulk replace: an epic this roadmap doesn't have means
      // ungrouped, not a dangling pointer.
      epicId:
        item.epicId && roadmap.epics.some((e) => e.id === item.epicId) ? item.epicId : '',
      status,
      difficulty: item.difficulty ?? RoadmapDifficulty.MEDIUM,
      reach: item.reach ?? 3,
      impact: item.impact ?? 3,
      confidence: item.confidence ?? 3,
      effort: item.effort ?? 3,
      progress: item.progress ?? 0,
      imageUrl: item.imageUrl ?? '',
      startDate: item.startDate ?? '',
      endDate: item.endDate ?? '',
      assignees: item.assignees ?? [],
      createdAt: now,
      startedAt: isStarted ? now : undefined,
      completedAt: status === RoadmapItemStatus.DONE ? now : undefined,
      milestoneId: item.milestoneId ?? '',
      objectiveId: item.objectiveId ?? '',
      keyResultId: item.keyResultId ?? '',
      okrLabel: item.okrLabel ?? '',
    };

    roadmap.replaceItems([...roadmap.items, created]);
    await this.roadmaps.update(roadmap);
    await this.clickup.roadmapItemsChanged(tenantId, id, [created]);
    return Result.ok({ roadmap, item: created });
  }
}

@Injectable()
export class ReplaceRoadmapColumnsUseCase
  implements
    IUsecaseExecute<
      { id: string; tenantId: string; dto: ReplaceRoadmapColumnsDto },
      Result<RoadmapEntity>
    >
{
  constructor(@Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository) {}
  async execute({
    id,
    tenantId,
    dto,
  }: {
    id: string;
    tenantId: string;
    dto: ReplaceRoadmapColumnsDto;
  }): Promise<Result<RoadmapEntity>> {
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');
    roadmap.replaceColumns(dto.columns);
    await this.roadmaps.update(roadmap);
    return Result.ok(roadmap);
  }
}

/**
 * Swap the roadmap's epics. Items whose epic disappears are un-grouped by the
 * entity (see `replaceEpics`) — the client's "move these items where?" prompt
 * covers the deliberate case, this covers every other one.
 */
@Injectable()
export class ReplaceRoadmapEpicsUseCase
  implements
    IUsecaseExecute<
      { id: string; tenantId: string; dto: ReplaceRoadmapEpicsDto },
      Result<RoadmapEntity>
    >
{
  constructor(@Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository) {}
  async execute({
    id,
    tenantId,
    dto,
  }: {
    id: string;
    tenantId: string;
    dto: ReplaceRoadmapEpicsDto;
  }): Promise<Result<RoadmapEntity>> {
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');
    // Trim and drop the unnamed; ids are the client's (a uuid it already put on
    // its items), so they're kept as sent — deduped, since two epics sharing an
    // id would make "which one is this item in?" unanswerable.
    const seen = new Set<string>();
    const epics: RoadmapEpic[] = [];
    for (const epic of dto.epics) {
      const label = (epic.label ?? '').trim();
      if (!epic.id || !label || seen.has(epic.id)) continue;
      seen.add(epic.id);
      epics.push({
        id: epic.id,
        label,
        color: epic.color,
        description: (epic.description ?? '').trim(),
      });
    }
    roadmap.replaceEpics(epics);
    await this.roadmaps.update(roadmap);
    return Result.ok(roadmap);
  }
}

@Injectable()
export class DeleteRoadmapUseCase
  implements IUsecaseExecute<{ id: string; tenantId: string }, Result<void>>
{
  constructor(
    @Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
  ) {}
  async execute({ id, tenantId }: { id: string; tenantId: string }): Promise<Result<void>> {
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');
    const itemIds = roadmap.items.map((item) => item.id);
    await this.roadmaps.delete(id);
    // Detach after the delete, same ordering and reasoning as above.
    if (itemIds.length) await this.issues.clearRoadmapItemIds(tenantId, itemIds);
    return Result.ok();
  }
}

@Injectable()
export class SetRoadmapSharingUseCase
  implements
    IUsecaseExecute<{ id: string; tenantId: string; enabled: boolean }, Result<RoadmapEntity>>
{
  constructor(@Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository) {}
  async execute({
    id,
    tenantId,
    enabled,
  }: {
    id: string;
    tenantId: string;
    enabled: boolean;
  }): Promise<Result<RoadmapEntity>> {
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');
    // Reuse the existing token when re-enabling so old links keep working.
    if (enabled) roadmap.enableSharing(roadmap.publicToken ?? uuid());
    else roadmap.disableSharing();
    await this.roadmaps.update(roadmap);
    return Result.ok(roadmap);
  }
}

/** Resolve a public share token into a read-only roadmap (items + columns are embedded). */
@Injectable()
export class GetPublicRoadmapUseCase
  implements IUsecaseExecute<{ token: string }, Result<RoadmapEntity>>
{
  constructor(@Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository) {}
  async execute({ token }: { token: string }): Promise<Result<RoadmapEntity>> {
    const roadmap = await this.roadmaps.findByPublicToken(token);
    if (!roadmap) return Result.fail('This link is not available');
    return Result.ok(roadmap);
  }
}
