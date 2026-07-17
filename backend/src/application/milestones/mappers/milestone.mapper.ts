import { MilestoneEntity } from '../domain/milestone.entity';
import {
  milestoneProgress,
  normalizeObjectives,
  objectiveProgress,
} from '../domain/milestone.types';
import { MilestoneResponseDto } from '../dtos/milestone.response.dto';

export class MilestoneMapper {
  static toResponseDto(milestone: MilestoneEntity): MilestoneResponseDto {
    // Normalizing on the way out means objectives/KRs stored before weights had
    // to sum to 100 — or before `locked` existed — still return a clean, typed
    // shape that honours the invariant.
    const objectives = normalizeObjectives(milestone.objectives ?? []);
    return {
      id: milestone.id.toString(),
      tenantId: milestone.tenantId,
      title: milestone.title,
      timeframe: milestone.timeframe,
      status: milestone.status,
      objectives: objectives.map((o) => ({ ...o, progress: objectiveProgress(o) })),
      roadmapIds: milestone.roadmapIds,
      progress: milestoneProgress(objectives),
      createdAt: milestone.createdAt,
      updatedAt: milestone.updatedAt,
    };
  }

  static toResponseDtoArray(milestones: MilestoneEntity[]): MilestoneResponseDto[] {
    return milestones.map((m) => this.toResponseDto(m));
  }
}
