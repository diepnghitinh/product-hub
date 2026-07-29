import { CycleEntity } from '../domain/entities/cycle.entity';
import { CycleRollup } from '../domain/enums/cycle.enums';

/** Port for cycle persistence. All reads are tenant-scoped. */
export abstract class ICycleRepository {
  /** A team's cycles, ascending by number. */
  findByTeam: (tenantId: string, teamId: string) => Promise<CycleEntity[]>;
  findById: (tenantId: string, id: string) => Promise<CycleEntity | null>;
  /**
   * Insert a freshly generated cycle. Returns false when the `(teamId, number)`
   * slot is already taken — two concurrent `ensureCyclesCurrent` runs compute
   * the same deterministic next cycle, the unique index makes the loser a no-op.
   */
  insert: (cycle: CycleEntity) => Promise<boolean>;
  /**
   * Atomically freeze a completed cycle's stats (only if not already closed).
   * Returns false when another request won the close — the caller skips its own
   * write so frozen history is written exactly once.
   */
  closeCycle: (tenantId: string, id: string, rollup: CycleRollup, at: Date) => Promise<boolean>;
  /** Persist a cycle's goal/notes (`null` clears it). Returns false when no such
   *  cycle exists for the tenant. A plain field write — unlike `closeCycle` there
   *  is no write-once claim to win. */
  setDescription: (tenantId: string, id: string, description: string | null) => Promise<boolean>;
  /** Persist a manual cycle's name and date window. Never touches the frozen
   *  stats — rescheduling a closed cycle moves the label, not the history. */
  saveSchedule: (cycle: CycleEntity) => Promise<boolean>;
  /** Delete one cycle. Returns false when it doesn't exist for the tenant; the
   *  caller detaches its issues. */
  deleteById: (tenantId: string, id: string) => Promise<boolean>;
  /** Delete a team's not-yet-started cycles (start > today); returns their ids
   *  so the caller can detach issues. Used when cycles are turned off. */
  deleteUpcoming: (tenantId: string, teamId: string, today: string) => Promise<string[]>;
  /** Delete ALL of a team's cycles — active and frozen history included — and
   *  return their ids so the caller can detach issues. Used when a rhythm change
   *  rebuilds the cadence from scratch. */
  deleteAllForTeam: (tenantId: string, teamId: string) => Promise<string[]>;
}
