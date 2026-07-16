import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { BugStatus, BugStatusConfig } from '@application/bugs/domain/enums/bug.enums';
import { WebhookConfig } from '../domain/webhook.types';

export class UpdateWebhooksDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  @IsArray()
  webhooks: WebhookConfig[];
}

/** One board column: a fixed workflow `key` with an editable label + color. */
export class BugStatusConfigDto {
  @ApiProperty({ enum: BugStatus })
  @IsEnum(BugStatus)
  key: BugStatus;

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

/** Flat settings shape. */
export class AppSettingsResponseDto {
  @ApiProperty()
  tenantId: string;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  webhooks: WebhookConfig[];

  @ApiProperty({ type: [BugStatusConfigDto] })
  bugStatuses: BugStatusConfig[];
}
