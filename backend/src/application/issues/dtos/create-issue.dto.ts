import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BugSeverity, IssueKind, TASK_ESTIMATE_VALUES } from '../domain/enums/issue.enums';

/**
 * Create an issue. `kind` picks task vs bug; the kind-specific fields (estimate &
 * roadmap link for a task, severity & case link for a bug) are optional and simply
 * ignored for the other kind.
 */
export class CreateIssueDto {
  @ApiProperty({ enum: IssueKind, description: 'task or bug' })
  @IsEnum(IssueKind)
  kind: IssueKind;

  @ApiProperty({ example: 'Wire the passkey ceremony to the auth endpoint' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Which column to open in — a built-in status or a team's custom column slug
   * (so a plain slug string, not an enum, the same way status *changes* are typed).
   * Omit to open in the kind's first column (todo / open).
   */
  @ApiPropertyOptional({ description: "Built-in status or a team's custom column key" })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*$/, { message: 'status must be a lowercase slug' })
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional({ description: 'Assignee user id' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Start date as YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End / target date as YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: "Team whose issue list to create in (defaults to the workspace's team for this kind)" })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({
    description:
      "Team cycle to create into (a board filtered to a cycle creates there). Must be one of the issue's team's current/upcoming cycles; never valid with `personal`",
  })
  @IsOptional()
  @IsString()
  cycleId?: string;

  @ApiPropertyOptional({ description: 'Link to a project' })
  @IsOptional()
  @IsString()
  projectId?: string;

  // ── task-only ──────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ deprecated: true, description: 'Legacy alias of endDate (task)' })
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Size estimate in points, 0 = none (task)', enum: TASK_ESTIMATE_VALUES })
  @IsOptional()
  @IsIn(TASK_ESTIMATE_VALUES)
  estimate?: number;

  @ApiPropertyOptional({ description: 'Parent issue id — set to create this as a sub-task (task)' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ description: 'Linked roadmap (backlog) id (task)' })
  @IsOptional()
  @IsString()
  roadmapId?: string;

  @ApiPropertyOptional({ description: 'The linked backlog item (roadmap item) id (task)' })
  @IsOptional()
  @IsString()
  roadmapItemId?: string;

  @ApiPropertyOptional({ description: 'Human-readable label of the linked backlog item (task)' })
  @IsOptional()
  @IsString()
  roadmapItemLabel?: string;

  @ApiPropertyOptional({
    description: 'Create on the caller’s private Personal board (task, owned by them, not in a team)',
  })
  @IsOptional()
  @IsBoolean()
  personal?: boolean;

  // ── bug-only ───────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ enum: BugSeverity, default: BugSeverity.MEDIUM, description: '(bug)' })
  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  @ApiPropertyOptional({ example: 'UI', description: 'Bug type/category (bug)' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Link to the test case this bug came from (bug)' })
  @IsOptional()
  @IsString()
  caseId?: string;

  @ApiPropertyOptional({ description: 'Human-readable label of the linked case (bug)' })
  @IsOptional()
  @IsString()
  caseLabel?: string;

  @ApiPropertyOptional({ description: 'Link to the report/feature the case belongs to (bug)' })
  @IsOptional()
  @IsString()
  reportId?: string;
}
