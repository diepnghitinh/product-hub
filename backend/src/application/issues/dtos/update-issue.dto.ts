import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CustomFieldValue } from '@application/teams/domain/enums/custom-field.enums';
import { BugSeverity, TASK_ESTIMATE_VALUES } from '../domain/enums/issue.enums';

/** One attachment on an issue — matches the upload endpoint's response shape. */
export class IssueAttachmentDto {
  @ApiProperty()
  @IsString()
  url: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
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

  @ApiPropertyOptional({ description: 'Assignee user id (empty string to unassign)' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

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

  @ApiPropertyOptional({ description: 'Linked roadmap (backlog) id (task)' })
  @IsOptional()
  @IsString()
  roadmapId?: string;

  @ApiPropertyOptional({ description: 'The linked backlog item id, empty string to unlink (task)' })
  @IsOptional()
  @IsString()
  roadmapItemId?: string;

  @ApiPropertyOptional({ description: 'Human-readable label of the linked backlog item (task)' })
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

  @ApiPropertyOptional({ type: [IssueAttachmentDto], description: '(bug)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IssueAttachmentDto)
  attachments?: IssueAttachmentDto[];
}
