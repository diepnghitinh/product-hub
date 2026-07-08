import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';
import { WebhookConfig } from '../domain/webhook.types';

export class UpdateWebhooksDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  @IsArray()
  webhooks: WebhookConfig[];
}

/** Flat settings shape. */
export class AppSettingsResponseDto {
  @ApiProperty()
  tenantId: string;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  webhooks: WebhookConfig[];
}
