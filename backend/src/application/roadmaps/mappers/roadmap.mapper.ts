import { RoadmapEntity } from '../domain/entities/roadmap.entity';
import { DEFAULT_ROADMAP_COLUMNS, riceScore } from '../domain/types/roadmap-item.type';
import { roadmapItemProgress } from '../domain/roadmap-progress';
import { RoadmapResponseDto } from '../dtos/roadmap.response.dto';

/**
 * `itemId → percent complete`, from `GetRoadmapProgressUseCase`.
 *
 * A **required** parameter, not an optional one: `progress` is derived from the
 * item's linked work (see {@link roadmapItemProgress}) and the number sitting in
 * the document is a leftover from when it was a slider. An optional parameter
 * would let a new endpoint quietly fall back to that stale value — the compiler
 * now makes every response say where its percentage came from.
 */
export type RoadmapProgressMap = Record<string, number>;

export class RoadmapMapper {
  static toResponseDto(roadmap: RoadmapEntity, progress: RoadmapProgressMap): RoadmapResponseDto {
    return {
      id: roadmap.id.toString(),
      tenantId: roadmap.tenantId,
      projectId: roadmap.projectId,
      title: roadmap.title,
      description: roadmap.description,
      // Defensive defaults so items created before image/date/assignees existed
      // still return a clean, typed shape.
      items: roadmap.items.map((item) => ({
        ...item,
        // '' for items minted before refs existed — every caller falls back to
        // the uuid, so they keep working until the backfill script runs.
        shortId: item.shortId ?? '',
        imageUrl: item.imageUrl ?? '',
        startDate: item.startDate ?? '',
        endDate: item.endDate ?? '',
        assignees: item.assignees ?? [],
        milestoneId: item.milestoneId ?? '',
        objectiveId: item.objectiveId ?? '',
        keyResultId: item.keyResultId ?? '',
        okrLabel: item.okrLabel ?? '',
        rice: riceScore(item),
        // Derived from the item's sub-tasks, never from the stored field. The
        // fallback covers an item whose rollup wasn't asked for (nothing does
        // that today) and is the same "no linked work" answer the use-case gives.
        progress: progress[item.id] ?? roadmapItemProgress(item.status),
        // Legacy items predate per-item timestamps — fall back to the roadmap's
        // own creation date so their age is sensible rather than blank.
        createdAt: item.createdAt ?? new Date(roadmap.createdAt).toISOString(),
        // Legacy items have no creator stored and there is nothing to derive one
        // from here (the activity row that knows is a different collection — see
        // `backfill:roadmap-item-creator`), so they answer '' rather than guess.
        createdById: item.createdById ?? '',
        createdByName: item.createdByName ?? '',
      })),
      columns: roadmap.columns?.length ? roadmap.columns : DEFAULT_ROADMAP_COLUMNS,
      itemCount: roadmap.items.length,
      publicEnabled: roadmap.publicEnabled,
      publicToken: roadmap.publicToken,
      createdAt: roadmap.createdAt,
      updatedAt: roadmap.updatedAt,
    };
  }

  /** One shared progress map across every roadmap in the list — the use-case
   *  prices them all in a single aggregation, so the keys never collide (item
   *  ids are uuids) and no roadmap pays for its own round trip. */
  static toResponseDtoArray(
    roadmaps: RoadmapEntity[],
    progress: RoadmapProgressMap,
  ): RoadmapResponseDto[] {
    return roadmaps.map((r) => this.toResponseDto(r, progress));
  }
}
