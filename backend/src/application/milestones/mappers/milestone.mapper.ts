import { MilestoneEntity } from '../domain/milestone.entity';
import { avgProgress, milestoneProgress } from '../domain/milestone.types';
import { MilestoneResponseDto } from '../dtos/milestone.response.dto';

export class MilestoneMapper {
  static toResponseDto(milestone: MilestoneEntity): MilestoneResponseDto {
    return {
      id: milestone.id.toString(),
      tenantId: milestone.tenantId,
      title: milestone.title,
      timeframe: milestone.timeframe,
      status: milestone.status,
      objectives: milestone.objectives.map((o) => ({
        id: o.id,
        title: o.title,
        keyResults: o.keyResults ?? [],
        progress: avgProgress(o.keyResults ?? []),
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
