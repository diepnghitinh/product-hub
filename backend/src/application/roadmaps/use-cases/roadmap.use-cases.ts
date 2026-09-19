import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { sequentialRef } from '@module-shared/utils/sequential-ref.util';
import { CounterService } from '@module-shared/services/counter.service';
import { RecordActivityUseCase } from '@application/audit-log/use-cases';
import { AuditActor, AuditEntity } from '@application/audit-log/domain/enums/audit.enums';
import {
  CreateRoadmapDto,
  ReplaceRoadmapColumnsDto,
  ReplaceRoadmapItemsDto,
  UpdateRoadmapDto,
} from '../dtos/roadmap.dtos';
import { RoadmapEntity } from '../domain/entities/roadmap.entity';
import { RoadmapDifficulty, RoadmapItemStatus } from '../domain/enums/roadmap.enums';
import {
  DEFAULT_ROADMAP_COLUMNS,
  ROADMAP_ITEM_REF_PREFIX,
  RoadmapItemData,
} from '../domain/types/roadmap-item.type';
import { diffRoadmapItems } from '../domain/roadmap-item-diff';
import { IRoadmapRepository } from '../repositories/roadmap.repository';

/** Fires one `RecordActivityUseCase` call per changed item, all sharing one
 *  `at` so a single drag or bulk edit groups together in the UI. `entityId`
 *  is deliberately the ITEM's id, not the roadmap's — the roadmap is only the
 *  container; the timeline a user opens belongs to the item. */
async function recordItemChanges(
  activity: RecordActivityUseCase,
  tenantId: string,
  before: RoadmapItemData[],
  after: RoadmapItemData[],
  actor: { type: AuditActor; id: string; name: string },
): Promise<void> {
  const itemChanges = diffRoadmapItems(before, after);
  if (!itemChanges.length) return;
  const at = new Date();
  for (const change of itemChanges) {
    await activity.execute({
      tenantId,
      entity: AuditEntity.ROADMAP_ITEM,
      entityId: change.itemId,
      entityRef: change.itemRef,
      actor,
      changes: change.changes,
      at,
    });
  }
}

/**
 * The next `RM-n` for this tenant, skipping anything the roadmap already holds.
 * Items are embedded in the roadmap document, so `taken` is the whole universe:
 * "unique" is checked in memory against the set of refs in play rather than
 * against an index — a collision inside one roadmap is what would actually break
 * a URL. Throws (via `sequentialRef`) if it cannot find a free number.
 */
async function mintItemRef(
  counters: CounterService,
  tenantId: string,
  taken: Set<string>,
): Promise<string> {
  const minted = await sequentialRef(counters, tenantId, ROADMAP_ITEM_REF_PREFIX, async (ref) =>
    taken.has(ref),
  );
  taken.add(minted.ref);
  return minted.ref;
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

export interface ReplaceRoadmapItemsRequest {
  id: string;
  tenantId: string;
  dto: ReplaceRoadmapItemsDto;
  /** The caller — recorded on history rows. */
  requesterId: string;
  requesterName: string;
  /** Defaults to USER. MCP passes API so a bot is distinguishable from a person. */
  actorType?: AuditActor;
}

@Injectable()
export class ReplaceRoadmapItemsUseCase
  implements IUsecaseExecute<ReplaceRoadmapItemsRequest, Result<RoadmapEntity>>
{
  constructor(
    @Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository,
    private readonly counters: CounterService,
    private readonly activity: RecordActivityUseCase,
  ) {}
  async execute({
    id,
    tenantId,
    dto,
    requesterId,
    requesterName,
    actorType,
  }: ReplaceRoadmapItemsRequest): Promise<Result<RoadmapEntity>> {
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');
    // Snapshot BEFORE any mutation: `roadmap.replaceItems` below assigns a whole
    // new array onto the entity in place, so a snapshot taken after would diff
    // the entity against itself and yield a permanently empty diff.
    const itemsBefore = roadmap.items;
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
    const now = new Date().toISOString();
    // A sequential loop, not `.map` + `Promise.all`: each draw has to see the
    // refs the previous ones took, and parallel draws would race a stale set.
    const items: typeof dto.items = [];
    try {
      for (const item of dto.items) {
        const prev = existingById.get(item.id);
        // Timing is driven by the item's status: "started" the first time it reaches
        // In progress (or jumps straight to Done), "completed" the first time it's
        // Done. The first stamp wins and is preserved thereafter, so toggling the
        // status later never moves the clock — and a client can't backdate it.
        const isStarted =
          item.status === RoadmapItemStatus.IN_PROGRESS || item.status === RoadmapItemStatus.DONE;
        const isCompleted = item.status === RoadmapItemStatus.DONE;
        items.push({
          ...item,
          // Only a genuinely new item draws a number — an existing one keeps its
          // ref, so a save never renumbers the board.
          shortId: prev?.shortId ?? (await mintItemRef(this.counters, tenantId, takenRefs)),
          // Progress is derived from the item's linked issues on every read (see
          // `roadmapItemProgress`), so what a client sends is not a fact about
          // anything. The stored number is frozen at whatever it last held rather
          // than dropped, so the field stays readable if this is ever reversed.
          progress: prev?.progress ?? 0,
          createdAt: prev?.createdAt ?? item.createdAt ?? now,
          // Server-owned like the ref and the timestamps: an existing item keeps
          // whoever created it, a brand-new one is credited to this requester,
          // and what the client sent is ignored — the board posts the whole array
          // back on every drag, so a trusted `createdBy` in the payload would let
          // any save reassign authorship of every item on the board.
          // Keyed on whether the item EXISTED, not on whether it has a creator:
          // `prev?.createdById ?? requesterId` would credit an old item — which
          // legitimately has no creator stored — to whoever happened to save the
          // board next, quietly manufacturing wrong attribution for every legacy
          // item the first time someone drags a card. An existing item keeps what
          // it has (even nothing, which the backfill can still fill in honestly).
          createdById: prev ? prev.createdById : requesterId,
          createdByName: prev ? prev.createdByName : requesterName,
          startedAt: prev?.startedAt ?? (isStarted ? now : undefined),
          completedAt: prev?.completedAt ?? (isCompleted ? now : undefined),
        });
      }
    } catch (error) {
      // `mintItemRef` throws; this use-case's contract is a Result, and an
      // uncaught throw would surface as a 500 rather than an actionable message.
      return Result.fail((error as Error).message);
    }
    roadmap.replaceItems(items);
    await this.roadmaps.update(roadmap);

    await recordItemChanges(this.activity, tenantId, itemsBefore, roadmap.items, {
      type: actorType ?? AuditActor.USER,
      id: requesterId,
      name: requesterName,
    });

    return Result.ok(roadmap);
  }
}

export interface AddRoadmapItemRequest {
  id: string;
  tenantId: string;
  item: Partial<Omit<RoadmapItemData, 'id'>> & { title: string };
  /** The caller — recorded on history rows. */
  requesterId: string;
  requesterName: string;
  /** Defaults to USER. MCP passes API so a bot is distinguishable from a person. */
  actorType?: AuditActor;
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
    private readonly counters: CounterService,
    private readonly activity: RecordActivityUseCase,
  ) {}
  async execute({
    id,
    tenantId,
    item,
    requesterId,
    requesterName,
    actorType,
  }: AddRoadmapItemRequest): Promise<Result<{ roadmap: RoadmapEntity; item: RoadmapItemData }>> {
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');
    // Snapshot BEFORE any mutation — see the same note in ReplaceRoadmapItemsUseCase.
    const itemsBefore = roadmap.items;

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
    // `mintItemRef` throws; this use-case's contract is a Result, and an uncaught
    // throw would surface as a 500 rather than an actionable message.
    let shortId: string;
    try {
      shortId = await mintItemRef(
        this.counters,
        tenantId,
        new Set(roadmap.items.map((i) => i.shortId).filter((ref): ref is string => !!ref)),
      );
    } catch (error) {
      return Result.fail((error as Error).message);
    }
    // Same RICE defaults the board's own "+ Add" uses (3s → a score of 9), so an
    // item added here sorts alongside hand-made ones instead of at zero.
    const created: RoadmapItemData = {
      id: uuid(),
      shortId,
      title: item.title,
      description: item.description ?? '',
      phase,
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
      // The caller is the creator — an MCP bot included, which is the honest
      // answer for an item a bot added on someone's behalf.
      createdById: requesterId,
      createdByName: requesterName,
      startedAt: isStarted ? now : undefined,
      completedAt: status === RoadmapItemStatus.DONE ? now : undefined,
      milestoneId: item.milestoneId ?? '',
      objectiveId: item.objectiveId ?? '',
      keyResultId: item.keyResultId ?? '',
      okrLabel: item.okrLabel ?? '',
    };

    roadmap.replaceItems([...roadmap.items, created]);
    await this.roadmaps.update(roadmap);

    await recordItemChanges(this.activity, tenantId, itemsBefore, roadmap.items, {
      type: actorType ?? AuditActor.USER,
      id: requesterId,
      name: requesterName,
    });

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

export interface DeleteRoadmapRequest {
  id: string;
  tenantId: string;
  /** The caller — recorded on the items' `deleted` rows. */
  requesterId: string;
  requesterName: string;
}

@Injectable()
export class DeleteRoadmapUseCase implements IUsecaseExecute<DeleteRoadmapRequest, Result<void>> {
  constructor(
    @Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository,
    private readonly activity: RecordActivityUseCase,
  ) {}
  async execute({
    id,
    tenantId,
    requesterId,
    requesterName,
  }: DeleteRoadmapRequest): Promise<Result<void>> {
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');
    // Snapshot BEFORE the delete — the items live inside the document that is
    // about to go, so nothing can name them afterwards.
    const doomed = roadmap.items.map((item) => ({
      id: item.id,
      ref: item.shortId || item.id,
    }));
    await this.roadmaps.delete(id);

    // `diffRoadmapItems` emits `deleted` faithfully when an item disappears
    // through `replaceItems`; dropping the whole roadmap has to say the same
    // thing, or an item's timeline just stops. The item is the tracked entity
    // — the roadmap is only its container, and has no timeline of its own to
    // record this on. `automated`: the user deleted a roadmap, not N items.
    const at = new Date();
    for (const item of doomed) {
      await this.activity.execute({
        tenantId,
        entity: AuditEntity.ROADMAP_ITEM,
        entityId: item.id,
        entityRef: item.ref,
        actor: { type: AuditActor.USER, id: requesterId, name: requesterName },
        automated: true,
        at,
        changes: [{ field: 'deleted', oldValue: '', newValue: '' }],
      });
    }

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
