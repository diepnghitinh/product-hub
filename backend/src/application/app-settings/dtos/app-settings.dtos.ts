import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BugStatusConfig } from '@application/bugs/domain/enums/bug.enums';
import { TaskStatusConfig, TaskLabelConfig } from '@application/tasks/domain/enums/task.enums';
import { WebhookConfig } from '../domain/webhook.types';

/** Column `key` slug — lowercase alnum + dashes. Built-ins fit this too. */
const STATUS_KEY = /^[a-z0-9][a-z0-9-]*$/;

export class UpdateWebhooksDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  @IsArray()
  webhooks: WebhookConfig[];
}

/** One board column: a slug `key` (built-in or custom) + editable label/color. */
export class BugStatusConfigDto {
  @ApiProperty({ example: 'needs-info' })
  @IsString()
  @Matches(STATUS_KEY, { message: 'key must be a lowercase slug' })
  @MaxLength(40)
  key: string;

  @ApiProperty({ example: 'In progress' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label: string;

  @ApiProperty({ example: '#2563eb' })
  @IsString()
  @MaxLength(32)
  color: string;
}

export class UpdateBugStatusesDto {
  @ApiProperty({ type: [BugStatusConfigDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BugStatusConfigDto)
  bugStatuses: BugStatusConfigDto[];
}

/** One task board column: a slug `key` (built-in or custom) + label/color. */
export class TaskStatusConfigDto {
  @ApiProperty({ example: 'in-review' })
  @IsString()
  @Matches(STATUS_KEY, { message: 'key must be a lowercase slug' })
  @MaxLength(40)
  key: string;

  @ApiProperty({ example: 'In review' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label: string;

  @ApiProperty({ example: '#2563eb' })
  @IsString()
  @MaxLength(32)
  color: string;
}

export class UpdateTaskStatusesDto {
  @ApiProperty({ type: [TaskStatusConfigDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => TaskStatusConfigDto)
  taskStatuses: TaskStatusConfigDto[];
}

/** One task label: a slug `key` + editable name/colour. No built-ins. */
export class TaskLabelConfigDto {
  @ApiProperty({ example: 'needs-design' })
  @IsString()
  @Matches(STATUS_KEY, { message: 'key must be a lowercase slug' })
  @MaxLength(40)
  key: string;

  @ApiProperty({ example: 'Needs design' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;

  @ApiProperty({ example: '#a855f7' })
  @IsString()
  @MaxLength(32)
  color: string;
}

export class UpdateTaskLabelsDto {
  // May be empty — a workspace can have no labels.
  @ApiProperty({ type: [TaskLabelConfigDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskLabelConfigDto)
  taskLabels: TaskLabelConfigDto[];
}

/** Flat settings shape. */
export class AppSettingsResponseDto {
  @ApiProperty()
  tenantId: string;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  webhooks: WebhookConfig[];

  @ApiProperty({ type: [BugStatusConfigDto] })
  bugStatuses: BugStatusConfig[];

  @ApiProperty({ type: [TaskStatusConfigDto] })
  taskStatuses: TaskStatusConfig[];

  @ApiProperty({ type: [TaskLabelConfigDto] })
  taskLabels: TaskLabelConfig[];
}
