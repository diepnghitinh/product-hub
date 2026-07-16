import { MilestoneEntity } from '../domain/milestone.entity';
import { milestoneProgress, objectiveProgress } from '../domain/milestone.types';
import { MilestoneResponseDto } from '../dtos/milestone.response.dto';

export class MilestoneMapper {
  static toResponseDto(milestone: MilestoneEntity): MilestoneResponseDto {
    return {
      id: milestone.id.toString(),
      tenantId: milestone.tenantId,
      title: milestone.title,
      timeframe: milestone.timeframe,
      status: milestone.status,
      // Defensive defaults so objectives/KRs created before weight/status/notes
      // existed still return a clean, typed shape.
      objectives: milestone.objectives.map((o) => ({
        id: o.id,
        title: o.title,
        keyResults: (o.keyResults ?? []).map((k) => ({
          id: k.id,
          title: k.title,
          progress: k.progress ?? 0,
          owner: k.owner ?? '',
          weight: k.weight ?? 0,
          status: k.status ?? '',
        })),
        weight: o.weight ?? 0,
        status: o.status ?? '',
        notes: o.notes ?? '',
        progress: objectiveProgress(o),
      })),
      roadmapIds: milestone.roadmapIds,
      progress: milestoneProgress(milestone.objectives),
      createdAt: milestone.createdAt,
      updatedAt: milestone.updatedAt,
    };
  }

  static toResponseDtoArray(milestones: MilestoneEntity[]): MilestoneResponseDto[] {
    return milestones.map((m) => this.toResponseDto(m));
  }
}
