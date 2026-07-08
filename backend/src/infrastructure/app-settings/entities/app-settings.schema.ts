import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { WebhookConfig } from '@application/app-settings/domain/webhook.types';

export interface AppSettingsDoc {
  _id: string;
  tenantId: string;
  webhooks: WebhookConfig[];
  createdAt: Date;
  updatedAt: Date;
}

export const AppSettingsSchema = new Schema<AppSettingsDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, unique: true, index: true },
    webhooks: { type: [Schema.Types.Mixed], default: [] } as unknown as WebhookConfig[],
  },
  { timestamps: true },
);
