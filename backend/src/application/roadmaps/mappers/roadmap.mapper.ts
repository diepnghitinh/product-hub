import { RoadmapEntity } from '../domain/entities/roadmap.entity';
import { DEFAULT_ROADMAP_COLUMNS, riceScore } from '../domain/types/roadmap-item.type';
import { RoadmapResponseDto } from '../dtos/roadmap.response.dto';

export class RoadmapMapper {
  static toResponseDto(roadmap: RoadmapEntity): RoadmapResponseDto {
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
        attachments: item.attachments ?? [],
        milestoneId: item.milestoneId ?? '',
        objectiveId: item.objectiveId ?? '',
        keyResultId: item.keyResultId ?? '',
        okrLabel: item.okrLabel ?? '',
        rice: riceScore(item),
        // Legacy items predate per-item timestamps — fall back to the roadmap's
        // own creation date so their age is sensible rather than blank.
        createdAt: item.createdAt ?? new Date(roadmap.createdAt).toISOString(),
      })),
      columns: roadmap.columns?.length ? roadmap.columns : DEFAULT_ROADMAP_COLUMNS,
      itemCount: roadmap.items.length,
      publicEnabled: roadmap.publicEnabled,
      publicToken: roadmap.publicToken,
      createdAt: roadmap.createdAt,
      updatedAt: roadmap.updatedAt,
    };
  }

  /**
   * The same roadmap as seen through a public share link, with every item's
   * attachments removed.
   *
   * Stripped from the payload rather than hidden in the UI on purpose: the file
   * URLs *are* the sensitive part. A spec or a revenue forecast attached to a
   * backlog item stays internal even when the plan around it is deliberately
   * public, and anything left in the response is readable by whoever holds the
   * link whether or not a page draws it.
   */
  static toPublicResponseDto(roadmap: RoadmapEntity): RoadmapResponseDto {
    const dto = this.toResponseDto(roadmap);
    return { ...dto, items: dto.items.map((item) => ({ ...item, attachments: [] })) };
  }

  static toResponseDtoArray(roadmaps: RoadmapEntity[]): RoadmapResponseDto[] {
    return roadmaps.map((r) => this.toResponseDto(r));
  }
}
