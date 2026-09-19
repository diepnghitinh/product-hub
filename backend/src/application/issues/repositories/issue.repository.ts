import { CycleRollup } from '@application/cycles/domain/enums/cycle.enums';
import { BurndownIssueRow } from '@application/cycles/domain/cycle-burndown';
import type { BugStatDimension, RawBugStats } from '@application/mcp/domain/mcp-bug-stats';
import { IssueEntity } from '../domain/entities/issue.entity';
import { StabilityIssueRow } from '../domain/bug-stability';
import { ChildRollup } from '../domain/issue-progress';
import { QueryIssueDto } from '../dtos/query-issue.dto';

export interface IssuePaginationResponse {
  data: IssueEntity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** One issue swept out of a completed cycle by {@link IIssueRepository.moveUnfinishedIssues}. */
export interface MovedIssue {
  id: string;
  shortId: string;
  fromCycleId: string;
  toCycleId: string;
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
  /** Count every issue whose parent is `parentId`, regardless of owner — the
   *  privacy filter on `findByTenant` hides personal-task children, but the
   *  delete-orphan guard must see them too, or it would orphan a private subtask. */
  countChildren: (tenantId: string, parentId: string) => Promise<number>;
  /** Every issue whose parent is `parentId`, regardless of owner — same
   *  no-ownerId scoping as `countChildren` (privacy filtering, if any, is the
   *  caller's job: e.g. Task 17's related-history assembly runs each child
   *  through its own `isVisibleTo` guard before using it). */
  findChildren: (tenantId: string, parentId: string) => Promise<IssueEntity[]>;
  /**
   * `{ total, done }` per parent for many parents at once — what a board's
   * progress bars are computed from, in **one** aggregation for the whole page
   * rather than a count per card. Parents with no children are simply absent
   * from the map (the caller reads that as {@link EMPTY_ROLLUP}).
   *
   * No ownerId scoping, like its two neighbours: a private sub-task still counts
   * towards its parent's percentage, and only the number is exposed — never the
   * child.
   */
  childRollups: (tenantId: string, parentIds: string[]) => Promise<Record<string, ChildRollup>>;
  /**
   * The same `{ total, done }`, but per **backlog item** — the issues linked to it
   * (`roadmapItemId`) *plus everything nested under those*, in one aggregation for
   * the whole roadmap. What a backlog item's derived progress is computed from
   * (see `roadmapItemProgress`).
   *
   * Two deliberate differences from {@link childRollups}:
   *  - it walks the subtree, because a linked task's own sub-tasks are work on
   *    that item too and only the roots carry `roadmapItemId`;
   *  - **bugs are excluded** — a bug against an item is work found, not work
   *    planned, and counting it would drop the delivery number the moment one is
   *    filed. Tasks *under* a bug still count; only the bug rows themselves drop.
   *
   * Items with no linked work are absent from the map (the caller falls back to
   * the item's own status).
   */
  roadmapItemRollups: (tenantId: string, itemIds: string[]) => Promise<Record<string, ChildRollup>>;
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
   *  rollover) or '' (back to no-cycle). Idempotent; returns the issues moved
   *  (with the cycle each came from), so the caller can log the rollover. */
  moveUnfinishedIssues: (
    tenantId: string,
    fromCycleIds: string[],
    toCycleId: string,
    completedStatusKeys: string[],
  ) => Promise<MovedIssue[]>;
  /** Detach every issue pointing at these cycles (deleted upcoming cycles).
   *  Returns the issues detached (with the cycle each came from), so the caller
   *  can log it — same contract as {@link moveUnfinishedIssues}, because an
   *  issue leaving a cycle by an admin action deserves the same row as one
   *  leaving it by rollover. */
  clearCycleIds: (tenantId: string, cycleIds: string[]) => Promise<MovedIssue[]>;
  /** Phân bố bug, gom nhóm nhiều chiều trong một lần aggregation. Chỉ chiều
   *  được xin mới dựng vào `$facet`. `trend` thêm hai nhánh mở/đóng theo mốc
   *  thời gian; bỏ trống thì không tính. Trả về hàng thô — mọi luật về trần và
   *  ô rỗng nằm ở `application/mcp/domain/mcp-bug-stats.ts`. */
  bugStats: (
    tenantId: string,
    filter: { teamId?: string; since?: Date; until?: Date },
    dimensions: BugStatDimension[],
    trend?: { unit: 'week' | 'month'; timezone: string },
  ) => Promise<RawBugStats>;
  /**
   * The rows the stability chart is reconstructed from: every bug of the given
   * severities born on or before `until`, projected to its two timestamps.
   *
   * Deliberately **not** limited to the charted window — the "still open" line
   * counts bugs however old, so a six-month-old critical that nobody closed has
   * to be in the set. Only serious severities are fetched, which is what keeps
   * that unbounded read small. Rules live in `domain/bug-stability.ts`.
   */
  bugsForStability: (
    tenantId: string,
    filter: { teamId?: string; projectId?: string; severities: string[]; until: Date },
  ) => Promise<StabilityIssueRow[]>;
  save: (issue: IssueEntity) => Promise<void>;
  update: (issue: IssueEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}
