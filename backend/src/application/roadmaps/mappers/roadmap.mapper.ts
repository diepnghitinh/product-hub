import { RoadmapEntity } from '../domain/entities/roadmap.entity';
import { riceScore } from '../domain/types/roadmap-item.type';
import { RoadmapResponseDto } from '../dtos/roadmap.response.dto';

export class RoadmapMapper {
  static toResponseDto(roadmap: RoadmapEntity): RoadmapResponseDto {
    return {
      id: roadmap.id.toString(),
      tenantId: roadmap.tenantId,
      projectId: roadmap.projectId,
      title: roadmap.title,
      description: roadmap.description,
      items: roadmap.items.map((item) => ({ ...item, rice: riceScore(item) })),
      itemCount: roadmap.items.length,
      createdAt: roadmap.createdAt,
      updatedAt: roadmap.updatedAt,
    };
  }

  static toResponseDtoArray(roadmaps: RoadmapEntity[]): RoadmapResponseDto[] {
    return roadmaps.map((r) => this.toResponseDto(r));
  }
}
