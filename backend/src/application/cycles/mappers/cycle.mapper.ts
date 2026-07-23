import { CycleEntity } from '../domain/entities/cycle.entity';
import { CycleStats } from '../domain/enums/cycle.enums';
import { CycleResponseDto } from '../dtos/cycle.dtos';

export class CycleMapper {
  /** `today` derives the status; `liveStats` overrides the stored numbers for a
   *  cycle that isn't closed yet (they're 0 in the document until the freeze). */
  static toResponseDto(cycle: CycleEntity, today: string, liveStats?: CycleStats): CycleResponseDto {
    const stats = cycle.isClosed || !liveStats
      ? {
          scopeCount: cycle.scopeCount,
          scopePoints: cycle.scopePoints,
          completedCount: cycle.completedCount,
          completedPoints: cycle.completedPoints,
        }
      : liveStats;
    return {
      id: cycle.id.toString(),
      tenantId: cycle.tenantId,
      teamId: cycle.teamId,
      number: cycle.number,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      status: cycle.statusOn(today),
      scopeCount: stats.scopeCount,
      scopePoints: stats.scopePoints,
      completedCount: stats.completedCount,
      completedPoints: stats.completedPoints,
      // Always the stored value: the who-left record only exists once frozen.
      unfinishedIds: cycle.unfinishedIds,
      createdAt: cycle.createdAt,
      updatedAt: cycle.updatedAt,
    };
  }
}
