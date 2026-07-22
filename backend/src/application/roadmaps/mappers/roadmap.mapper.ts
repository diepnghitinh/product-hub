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
        imageUrl: item.imageUrl ?? '',
        startDate: item.startDate ?? '',
        assignees: item.assignees ?? [],
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

  static toResponseDtoArray(roadmaps: RoadmapEntity[]): RoadmapResponseDto[] {
    return roadmaps.map((r) => this.toResponseDto(r));
  }
}
