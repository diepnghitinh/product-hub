import { UniqueEntityID } from '@core/domain';

export interface CycleProps {
  id: UniqueEntityID;
  tenantId: string;
  /** The team whose rhythm this cycle belongs to — a cycle is never cross-team. */
  teamId: string;
  /** Auto-incremented per team: Cycle 1, 2, 3… Unique per (teamId, number). */
  number: number;
  /** ISO `YYYY-MM-DD`, inclusive — the same date-only convention as issues. */
  startDate: string;
  endDate: string;
  /**
   * Rollup numbers frozen when the cycle's end passed and the boundary was
   * processed (auto-rollover moves unfinished issues away, so without the
   * freeze every past cycle would read "100% done, tiny scope"). All 0 until
   * then — live values are computed from the cycle's issues on read.
   */
  scopeCount: number;
  scopePoints: number;
  completedCount: number;
  completedPoints: number;
  /**
   * The issues that were NOT done when this cycle closed — the ids the boundary
   * sweep moved away. Without this list the sweep's `cycleId` rewrite would be
   * the only copy of "planned here but unfinished" (a closed board would list
   * only its finishers). Frozen with the stats; [] until then, and [] forever on
   * cycles closed before this field existed (only their counts survive).
   */
  unfinishedIds: string[];
  /** When the completion boundary was processed (stats frozen, issues rolled);
   *  null while upcoming/active. The status itself is derived from dates. */
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
