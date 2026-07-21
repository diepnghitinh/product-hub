import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CustomFieldValue } from '@application/teams/domain/enums/custom-field.enums';
import { TASK_ESTIMATE_VALUES } from '../domain/enums/task.enums';

export class UpdateTaskDto {
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

  @ApiPropertyOptional({ description: 'Parent task id (empty string to detach from its parent)' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ description: 'Linked roadmap (backlog) id' })
  @IsOptional()
  @IsString()
  roadmapId?: string;

  @ApiPropertyOptional({ description: 'The linked backlog item id (empty string to unlink)' })
  @IsOptional()
  @IsString()
  roadmapItemId?: string;

  @ApiPropertyOptional({ description: 'Human-readable label of the linked backlog item' })
  @IsOptional()
  @IsString()
  roadmapItemLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Due date as YYYY-MM-DD (empty string to clear)' })
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional({
    description: 'Size estimate in points (0 to clear back to "no estimate")',
    enum: TASK_ESTIMATE_VALUES,
  })
  @IsOptional()
  @IsIn(TASK_ESTIMATE_VALUES)
  estimate?: number;

  @ApiPropertyOptional({ description: 'Assignee user id (empty string to unassign)' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({
    description: "Keys of the team labels on this task (replaces the set; [] clears)",
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
