import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_ATTACHMENTS } from '@application/storage/domain/stored-file.type';
import { CustomFieldValue } from '@application/teams/domain/enums/custom-field.enums';
import { BugSeverity, TASK_ESTIMATE_VALUES } from '../domain/enums/issue.enums';

/** One attachment on an issue — matches the upload endpoint's response shape. */
export class IssueAttachmentDto {
  /**
   * Where the file lives. Constrained to http(s) rather than validated as a URL:
   * this is the string the app later renders as a link, so the point is to keep
   * `javascript:` out, and `@IsUrl` would reject the host-less URLs a local MinIO
   * or a self-hosted bucket produces.
   */
  @ApiProperty()
  @IsString()
  @Matches(/^https?:\/\//i, { message: 'An attachment URL must start with http:// or https://' })
  @MaxLength(2048)
  url: string;

  @ApiProperty()
  @IsString()
  @MaxLength(260)
  name: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  contentType: string;

  @ApiProperty()
  @IsNumber()
  size: number;
}

/** Patch an issue. Every field is optional; kind-specific fields are only
 *  meaningful for that kind and ignored otherwise. */
export class UpdateIssueDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({
    description:
      'Replaces the whole assignee list, primary first (empty array to unassign). ' +
      'Takes precedence over `assigneeId`.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[];

  @ApiPropertyOptional({
    description:
      'Single assignee user id (empty string to unassign) — shorthand that replaces ' +
      'the list with just this person',
  })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({
    description:
      "Team cycle to commit this issue to; '' leaves the cycle. Must be one of the " +
      "issue's team's current/upcoming cycles (completed ones are history)",
  })
  @IsOptional()
  @IsString()
  cycleId?: string;

  @ApiPropertyOptional({ description: 'Start date as YYYY-MM-DD (empty string to clear)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End / target date as YYYY-MM-DD (empty string to clear)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    description: "Keys of the team labels on this issue (replaces the set; [] clears)",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  labelKeys?: string[];

  @ApiPropertyOptional({
    type: Object,
    description: 'Values for the team custom fields, keyed by field id (replaces the whole map)',
  })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, CustomFieldValue>;

  // ── task-only ──────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ deprecated: true, description: 'Legacy alias of endDate (task); empty string to clear' })
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Size estimate in points, 0 to clear (task)', enum: TASK_ESTIMATE_VALUES })
  @IsOptional()
  @IsIn(TASK_ESTIMATE_VALUES)
  estimate?: number;

  @ApiPropertyOptional({ description: 'Parent issue id, empty string to detach (task)' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ description: 'Linked roadmap (backlog) id (task or bug)' })
  @IsOptional()
  @IsString()
  roadmapId?: string;

  @ApiPropertyOptional({ description: 'The linked backlog item id, empty string to unlink (task or bug)' })
  @IsOptional()
  @IsString()
  roadmapItemId?: string;

  @ApiPropertyOptional({ description: 'Human-readable label of the linked backlog item (task or bug)' })
  @IsOptional()
  @IsString()
  roadmapItemLabel?: string;

  // ── bug-only ───────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ enum: BugSeverity, description: '(bug)' })
  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  @ApiPropertyOptional({ description: 'Bug type/category (bug)' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Link to a test case, empty string to unlink (bug)' })
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

  /** Files on the issue — both kinds carry them (a bug's screenshot, a task's
   *  spec). Replaces the whole list; `[]` detaches everything. */
  @ApiPropertyOptional({ type: [IssueAttachmentDto], description: 'Attached files' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ATTACHMENTS)
  @ValidateNested({ each: true })
  @Type(() => IssueAttachmentDto)
  attachments?: IssueAttachmentDto[];
}
