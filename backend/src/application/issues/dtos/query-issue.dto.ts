import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '@module-shared/modules/pagination/pagination.dto';
import { TransformQueryArray } from '@module-shared/utils/query-array.util';
import { BugSeverity, IssueKind } from '../domain/enums/issue.enums';

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
}
