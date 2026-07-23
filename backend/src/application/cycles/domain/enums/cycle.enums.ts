import { BugStatus, TaskStatus } from '@application/issues/domain/enums/issue.enums';
import { TeamIssueType } from '@application/teams/domain/enums/team.enums';

/** Derived from the cycle's dates on read — never stored. */
export enum CycleStatus {
  UPCOMING = 'upcoming',
  ACTIVE = 'active',
  COMPLETED = 'completed',
}

/** Sentinels a `cycleId` list filter accepts besides a real cycle id. The server
 *  resolves them against the team's cycles, so saved links (`?cycle=current`)
 *  never go stale as cycles roll. */
export const CYCLE_FILTER_CURRENT = 'current';
export const CYCLE_FILTER_UPCOMING = 'upcoming';
export const CYCLE_FILTER_NONE = 'none';

/** What `current`/`upcoming` resolve to when no such cycle exists (e.g. during
 *  cooldown): a cycle id that cannot match any issue, so the list reads empty. */
export const CYCLE_FILTER_NO_MATCH = '__no-cycle__';

/**
 * The status keys that count as "finished" for cycle rollups and rollover.
 * Statuses have no done-category yet, so — like every other rollup in the
 * codebase — this reads the built-in keys literally: issues in custom columns
 * count as unfinished and therefore roll over (see features/cycles.md §7.2).
 */
export function completedStatusKeysFor(issueType: TeamIssueType): string[] {
  return issueType === TeamIssueType.BUG
    ? [BugStatus.RESOLVED, BugStatus.CLOSED]
    : [TaskStatus.DONE];
}

/** Config bounds (shared by the DTO and the entity guard). */
export const CYCLE_LENGTH_WEEKS_MIN = 1;
export const CYCLE_LENGTH_WEEKS_MAX = 4;
export const CYCLE_COOLDOWN_WEEKS_MIN = 0;
export const CYCLE_COOLDOWN_WEEKS_MAX = 2;

/** The frozen-at-completion rollup numbers (0 until then; live values are
 *  computed on read while a cycle is upcoming/active). */
export interface CycleStats {
  scopeCount: number;
  scopePoints: number;
  completedCount: number;
  completedPoints: number;
}

/** A rollup plus the ids of the not-yet-done issues in the same snapshot — the
 *  list the boundary sweep is about to move away. Both come out of one
 *  aggregation pass, so a frozen cycle satisfies
 *  `completedCount + unfinishedIds.length === scopeCount` by construction. */
export interface CycleRollup extends CycleStats {
  unfinishedIds: string[];
}

export const EMPTY_CYCLE_STATS: CycleStats = {
  scopeCount: 0,
  scopePoints: 0,
  completedCount: 0,
  completedPoints: 0,
};
