import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BugStatusConfig } from '@application/bugs/domain/enums/bug.enums';
import { TaskStatusConfig, TaskLabelConfig } from '@application/tasks/domain/enums/task.enums';
import { WebhookConfig, WebhookEvent, WebhookProvider } from '../domain/webhook.types';
import { StorageProvider } from '../domain/storage.types';

/** Column `key` slug — lowercase alnum + dashes. Built-ins fit this too. */
const STATUS_KEY = /^[a-z0-9][a-z0-9-]*$/;

/** Maps a workspace member to their chat-platform id, for @mentions. */
export class WebhookMemberMappingDto {
  @ApiProperty({ example: 'a1b2c3d4' })
  @IsString()
  @MaxLength(120)
  userId: string;

  @ApiProperty({ example: '7553095341206175776', description: 'Lark open_id / Telegram user id.' })
  @IsString()
  @MaxLength(200)
  providerUserId: string;

  @ApiProperty({ example: 'Felix' })
  @IsString()
  @MaxLength(120)
  displayName: string;
}

/** One outbound webhook. `url` is used by Lark; `botToken`+`chatId` by Telegram. */
export class WebhookConfigDto {
  @ApiProperty({ example: 'a1b2c3' })
  @IsString()
  @MaxLength(64)
  id: string;

  @ApiProperty({ enum: WebhookProvider, example: WebhookProvider.LARK })
  @IsEnum(WebhookProvider)
  provider: WebhookProvider;

  @ApiProperty({ example: 'Lark' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'https://open.larksuite.com/open-apis/bot/v2/hook/xxxx' })
  @IsString()
  @MaxLength(1000)
  url: string;

  @ApiProperty({ required: false, description: 'Telegram bot token.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  botToken?: string;

  @ApiProperty({ required: false, description: 'Telegram chat id the bot posts to.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  chatId?: string;

  @ApiProperty({ enum: WebhookEvent, isArray: true })
  @IsArray()
  @IsEnum(WebhookEvent, { each: true })
  events: WebhookEvent[];

  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ type: [WebhookMemberMappingDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookMemberMappingDto)
  memberMappings?: WebhookMemberMappingDto[];
}

export class UpdateWebhooksDto {
  @ApiProperty({ type: [WebhookConfigDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookConfigDto)
  webhooks: WebhookConfigDto[];
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

/**
 * Cloud storage for uploaded media. Secrets (`s3SecretAccessKey`,
 * `azureConnectionString`) are write-only: send a value to set/replace it, omit
 * or send blank to keep the stored one. Every non-secret field is a full replace.
 */
export class UpdateStorageDto {
  @ApiProperty({ enum: StorageProvider, example: StorageProvider.S3 })
  @IsEnum(StorageProvider)
  provider: StorageProvider;

  @ApiProperty({ required: false, example: 'ap-southeast-1' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  s3Region?: string;

  @ApiProperty({ required: false, example: 'my-bucket' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  s3Bucket?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  s3AccessKeyId?: string;

  @ApiProperty({ required: false, description: 'Write-only; blank keeps the stored secret.' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  s3SecretAccessKey?: string;

  @ApiProperty({ required: false, example: 'https://s3.example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  s3Endpoint?: string;

  @ApiProperty({ required: false, example: 'https://cdn.example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  s3PublicBaseUrl?: string;

  @ApiProperty({ required: false, description: 'Write-only; blank keeps the stored secret.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  azureConnectionString?: string;

  @ApiProperty({ required: false, example: 'media' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  azureContainer?: string;

  @ApiProperty({ required: false, example: 30, minimum: 1, maximum: 2000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  maxVideoMb?: number;

  @ApiProperty({ required: false, example: 10, minimum: 1, maximum: 2000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  maxImageMb?: number;
}

/** Storage config as returned to the client — secrets masked to booleans. */
export class StorageSettingsResponseDto {
  @ApiProperty({ enum: StorageProvider })
  provider: StorageProvider;

  @ApiProperty({ required: false })
  s3Region?: string;
  @ApiProperty({ required: false })
  s3Bucket?: string;
  @ApiProperty({ required: false })
  s3AccessKeyId?: string;
  @ApiProperty({ required: false })
  s3Endpoint?: string;
  @ApiProperty({ required: false })
  s3PublicBaseUrl?: string;
  @ApiProperty({ description: 'True when an S3 secret key is stored.' })
  s3SecretConfigured: boolean;

  @ApiProperty({ required: false })
  azureContainer?: string;
  @ApiProperty({ description: 'True when an Azure connection string is stored.' })
  azureConnectionConfigured: boolean;

  @ApiProperty()
  maxVideoMb: number;
  @ApiProperty()
  maxImageMb: number;
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

  @ApiProperty({ type: StorageSettingsResponseDto })
  storage: StorageSettingsResponseDto;
}
