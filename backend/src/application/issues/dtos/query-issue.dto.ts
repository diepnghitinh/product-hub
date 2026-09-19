import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '@module-shared/modules/pagination/pagination.dto';
import { TransformQueryArray } from '@module-shared/utils/query-array.util';
import { BugSeverity, IssueKind } from '../domain/enums/issue.enums';

export type IssueSortField = 'id' | 'created' | 'updated' | 'severity';
export type IssueSortDir = 'asc' | 'desc';

export const ISSUE_SORT_FIELDS: IssueSortField[] = ['id', 'created', 'updated', 'severity'];
export const ISSUE_SORT_DIRS: IssueSortDir[] = ['asc', 'desc'];

/** Multi-value filters accept `?x=a`, `?x=a,b` or `?x=a&x=b` — see
 * `TransformQueryArray`, which keeps single-value callers working. */
export class QueryIssueDto extends PaginationDto {
  @ApiPropertyOptional({ enum: IssueKind, isArray: true, description: 'task and/or bug' })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsEnum(IssueKind, { each: true })
  kind?: IssueKind[];

  // Status is a free slug (built-ins + custom columns span both kinds), so it is
  // validated as a string, not an enum.
  @ApiPropertyOptional({ description: 'Filter by status key(s)', isArray: true })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsString({ each: true })
  status?: string[];

  @ApiPropertyOptional({ enum: BugSeverity, isArray: true, description: 'Bug severity' })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsEnum(BugSeverity, { each: true })
  severity?: BugSeverity[];

  @ApiPropertyOptional({ description: 'Filter by assignee user id(s)', isArray: true })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsString({ each: true })
  assigneeId?: string[];

  @ApiPropertyOptional({
    description:
      'Filter by who opened the issue — user id(s). A bug mirrors this into its reporter, ' +
      'so it is the one people axis that means the same thing on both kinds.',
    isArray: true,
  })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsString({ each: true })
  createdBy?: string[];

  @ApiPropertyOptional({ description: "Filter by the team's issue list" })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ description: 'Issues assigned to this user id (the "Assigned to me" views)' })
  @IsOptional()
  @IsString()
  mine?: string;

  @ApiPropertyOptional({
    description: 'Return the caller’s private Personal board (their owned tasks) instead of team issues',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  personal?: boolean;

  @ApiPropertyOptional({
    description:
      'Fetch specific issues by id — e.g. a closed cycle’s frozen "carried over" ' +
      'list, whose issues no longer point at that cycle',
    isArray: true,
  })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];

  @ApiPropertyOptional({ description: 'Filter by parent issue id(s) — an issue’s sub-tasks', isArray: true })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsString({ each: true })
  parentId?: string[];

  @ApiPropertyOptional({ description: 'Filter by linked backlog item (roadmap item) id(s)', isArray: true })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsString({ each: true })
  roadmapItemId?: string[];

  @ApiPropertyOptional({ description: 'Filter by linked roadmap id(s)', isArray: true })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsString({ each: true })
  roadmapId?: string[];

  @ApiPropertyOptional({ description: 'Filter by project id(s)', isArray: true })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsString({ each: true })
  projectId?: string[];

  @ApiPropertyOptional({
    description:
      "Filter by team cycle: a cycle id, or the sentinels 'current' / 'upcoming' / 'none' " +
      '(resolved server-side against the teamId filter, so saved links never go stale)',
  })
  @IsOptional()
  @IsString()
  cycleId?: string;

  @ApiPropertyOptional({ description: 'Filter by linked test case id (bug)' })
  @IsOptional()
  @IsString()
  caseId?: string;

  @ApiPropertyOptional({ description: 'Filter by linked report id (bug)' })
  @IsOptional()
  @IsString()
  reportId?: string;

  @ApiPropertyOptional({
    description:
      'Sort field. Omit to keep the board ordering (manual drag position, then newest first). ' +
      '`severity` orders by the bug scale (low → critical), not alphabetically; an issue with ' +
      'no severity (every task) sorts below `low`.',
    enum: ISSUE_SORT_FIELDS,
  })
  @IsOptional()
  @IsIn(ISSUE_SORT_FIELDS)
  sort?: IssueSortField;

  @ApiPropertyOptional({ description: 'Sort direction (default desc)', enum: ISSUE_SORT_DIRS })
  @IsOptional()
  @IsIn(ISSUE_SORT_DIRS)
  dir?: IssueSortDir;

  // ── date-range filters ──────────────────────────────────────────────────────
  // Each end is inclusive and optional (either alone = an open-ended range).
  // A bare `YYYY-MM-DD` is read as that whole day in UTC; pass a full instant
  // when the day must be the *user's* — see `dateRangeFilter`.

  @ApiPropertyOptional({
    description: 'Opened on/after this date — YYYY-MM-DD or a full ISO instant',
    example: '2026-07-01',
  })
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional({
    description: 'Opened on/before this date (inclusive) — YYYY-MM-DD or a full ISO instant',
    example: '2026-07-31',
  })
  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @ApiPropertyOptional({
    description:
      'Solved (moved to a done status) on/after this date. Issues still open have no ' +
      'solved date and are excluded — YYYY-MM-DD or a full ISO instant',
    example: '2026-07-01',
  })
  @IsOptional()
  @IsISO8601()
  resolvedFrom?: string;

  @ApiPropertyOptional({
    description: 'Solved on/before this date (inclusive) — YYYY-MM-DD or a full ISO instant',
    example: '2026-07-31',
  })
  @IsOptional()
  @IsISO8601()
  resolvedTo?: string;

  // ── scheduled window ────────────────────────────────────────────────────────
  // Unlike the two above, these match against the issue's **planned dates**
  // (start → end/due), not a timestamp, and they match by *overlap*: an issue
  // running 1–31 July is in every week of July, not only the week it started.
  // That is what "what was being worked on between these dates" means, and it is
  // also what the calendar view fetches a month with. Both ends are plain
  // calendar days, because that is how `startDate`/`endDate` are stored.

  @ApiPropertyOptional({
    description:
      'Scheduled work overlapping on/after this day — an issue counts when its start→end ' +
      'window touches the range at all. Issues with no dates are excluded. YYYY-MM-DD.',
    example: '2026-07-01',
  })
  @IsOptional()
  @IsISO8601()
  scheduledFrom?: string;

  @ApiPropertyOptional({
    description: 'Scheduled work overlapping on/before this day (inclusive) — YYYY-MM-DD',
    example: '2026-07-31',
  })
  @IsOptional()
  @IsISO8601()
  scheduledTo?: string;
}
