import { RoadmapEntity } from '../domain/entities/roadmap.entity';
import {
  RoadmapColumnTemplate,
  resolveRoadmapColumns,
  riceScore,
} from '../domain/types/roadmap-item.type';
import { RoadmapResponseDto } from '../dtos/roadmap.response.dto';

export class RoadmapMapper {
  /**
   * `templates` is the workspace's column templates. Columns are resolved here,
   * at the API edge, rather than left to each client: a roadmap linked to a
   * template stores its own (dormant) array, so a response that handed back
   * `roadmap.columns` raw would show every reader the board's *previous*
   * layout. Resolving once also means nothing downstream — the board, the
   * timeline, the RICE table, backlog grouping, the public share view — had to
   * learn that templates exist.
   */
  static toResponseDto(
    roadmap: RoadmapEntity,
    templates: RoadmapColumnTemplate[] = [],
  ): RoadmapResponseDto {
    const { columns, template } = resolveRoadmapColumns(roadmap, templates);
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
        // '' for items written before epics existed — i.e. ungrouped, which is
        // exactly what they are.
        epicId: item.epicId ?? '',
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
      columns,
      // The *effective* link, not the stored one: a template deleted out from
      // under this roadmap resolves as custom, and saying so is what lets the
      // Manage-columns dialog show the truth instead of a dangling name.
      columnTemplateId: template?.id ?? '',
      columnTemplateName: template?.name ?? '',
      // No default here, unlike columns: a roadmap nobody has grouped genuinely
      // has no epics, and inventing one would put an empty swimlane on the board.
      epics: (roadmap.epics ?? []).map((epic) => ({ ...epic, description: epic.description ?? '' })),
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
  static toPublicResponseDto(
    roadmap: RoadmapEntity,
    templates: RoadmapColumnTemplate[] = [],
  ): RoadmapResponseDto {
    const dto = this.toResponseDto(roadmap, templates);
    return { ...dto, items: dto.items.map((item) => ({ ...item, attachments: [] })) };
  }

  static toResponseDtoArray(
    roadmaps: RoadmapEntity[],
    templates: RoadmapColumnTemplate[] = [],
  ): RoadmapResponseDto[] {
    return roadmaps.map((r) => this.toResponseDto(r, templates));
  }
}
