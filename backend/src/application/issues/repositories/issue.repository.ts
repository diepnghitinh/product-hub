import { CycleRollup } from '@application/cycles/domain/enums/cycle.enums';
import { BurndownIssueRow } from '@application/cycles/domain/cycle-burndown';
import { IssueEntity } from '../domain/entities/issue.entity';
import { QueryIssueDto } from '../dtos/query-issue.dto';

export interface IssuePaginationResponse {
  data: IssueEntity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Port for issue persistence (the unified tasks+bugs store). All reads are
 *  tenant-scoped. */
export abstract class IIssueRepository {
  findById: (id: string) => Promise<IssueEntity | null>;
  /** Resolve by shortId (`TSK-7` / `BUG-12`) within a tenant, falling back to the
   *  uuid so links made before short ids existed keep working. */
  findByRef: (tenantId: string, ref: string) => Promise<IssueEntity | null>;
  /** Rows still missing a shortId — drives the one-off backfill. */
  findWithoutShortId: () => Promise<{ id: string; tenantId: string }[]>;
  setShortId: (id: string, shortId: string) => Promise<void>;
  /** File rows with no team into `teamId`; returns how many moved. */
  assignMissingTeam: (tenantId: string, teamId: string) => Promise<number>;
  /** `opts.personalOwnerId` scopes to that user's private personal board; without
   *  it the query excludes personal tasks (filters `ownerId: ''`). */
  findByTenant: (
    tenantId: string,
    query: QueryIssueDto,
    opts?: { personalOwnerId?: string },
  ) => Promise<IssuePaginationResponse>;
  countByStatus: (tenantId: string, status: string) => Promise<number>;
  /** Scope/completed (count + points) per cycle id, in one aggregation. Feeds
   *  both the live rollups and the freeze at cycle completion. */
  cycleRollups: (
    tenantId: string,
    cycleIds: string[],
    completedStatusKeys: string[],
  ) => Promise<Record<string, CycleRollup>>;
  /** The rows a cycle's burn-up is reconstructed from — its current members
   *  plus `extraIds` (a completed cycle's swept-away `unfinishedIds`, so its
   *  frozen scope is still represented). Projected to just the timestamps and
   *  grouping fields the chart needs. */
  issuesForBurndown: (
    tenantId: string,
    cycleId: string,
    extraIds: string[],
  ) => Promise<BurndownIssueRow[]>;
  /** Sweep unfinished issues out of completed cycles into `toCycleId` (auto-
   *  rollover) or '' (back to no-cycle). Idempotent; returns how many moved. */
  moveUnfinishedIssues: (
    tenantId: string,
    fromCycleIds: string[],
    toCycleId: string,
    completedStatusKeys: string[],
  ) => Promise<number>;
  /** Detach every issue pointing at these cycles (deleted upcoming cycles). */
  clearCycleIds: (tenantId: string, cycleIds: string[]) => Promise<number>;
  save: (issue: IssueEntity) => Promise<void>;
  update: (issue: IssueEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}
