import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { BugStatusConfig } from '@application/bugs/domain/enums/bug.enums';
import { TaskStatusConfig, TaskLabelConfig } from '@application/tasks/domain/enums/task.enums';
import { WebhookConfig } from '@application/app-settings/domain/webhook.types';
import { CloudStorageConfig } from '@application/app-settings/domain/storage.types';

export interface AppSettingsDoc {
  _id: string;
  tenantId: string;
  webhooks: WebhookConfig[];
  bugStatuses: BugStatusConfig[];
  taskStatuses: TaskStatusConfig[];
  /** Legacy: workspace-wide task labels, now per-team. Read once by the boot
   *  backfill to seed teams, then unset. No API path writes it anymore. */
  taskLabels?: TaskLabelConfig[];
  storage?: CloudStorageConfig;
  createdAt: Date;
  updatedAt: Date;
}

export const AppSettingsSchema = new Schema<AppSettingsDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, unique: true, index: true },
    webhooks: { type: [Schema.Types.Mixed], default: [] } as unknown as WebhookConfig[],
    // Left undefined until customized — the domain seeds the shipped defaults.
    bugStatuses: { type: [Schema.Types.Mixed], default: undefined } as unknown as BugStatusConfig[],
    taskStatuses: { type: [Schema.Types.Mixed], default: undefined } as unknown as TaskStatusConfig[],
    // Legacy — kept only so the boot backfill can read + unset it (see AppSettingsDoc).
    taskLabels: { type: [Schema.Types.Mixed], default: undefined } as unknown as TaskLabelConfig[],
    // Whole config as one mixed blob (secrets included; masked at the API edge).
    storage: { type: Schema.Types.Mixed, default: undefined } as unknown as CloudStorageConfig,
  },
  { timestamps: true },
);
