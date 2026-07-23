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
  /** Delete a team's not-yet-started cycles (start > today); returns their ids
   *  so the caller can detach issues. Used when cycles are disabled/re-rhythmed. */
  deleteUpcoming: (tenantId: string, teamId: string, today: string) => Promise<string[]>;
}
