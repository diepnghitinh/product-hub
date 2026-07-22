import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CustomFieldValue } from '@application/teams/domain/enums/custom-field.enums';
import { BugSeverity } from '../domain/enums/bug.enums';

/** One attachment on a bug — matches the upload endpoint's response shape. */
export class BugAttachmentDto {
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

export class UpdateBugDto {
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

  @ApiPropertyOptional({ enum: BugSeverity })
  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Link to a test case (empty string to unlink)' })
  @IsOptional()
  @IsString()
  caseId?: string;

  @ApiPropertyOptional({ description: 'Human-readable label of the linked case' })
  @IsOptional()
  @IsString()
  caseLabel?: string;

  @ApiPropertyOptional({ description: 'Link to the report/feature the case belongs to' })
  @IsOptional()
  @IsString()
  reportId?: string;

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

  @ApiPropertyOptional({ type: [BugAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BugAttachmentDto)
  attachments?: BugAttachmentDto[];

  @ApiPropertyOptional({
    description: "Keys of the team labels on this bug (replaces the set; [] clears)",
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
}
