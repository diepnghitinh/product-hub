import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { BugStatusConfig } from '@application/bugs/domain/enums/bug.enums';
import { TaskStatusConfig, TaskLabelConfig } from '@application/tasks/domain/enums/task.enums';
import { WebhookConfig } from '@application/app-settings/domain/webhook.types';
import { CloudStorageConfig } from '@application/app-settings/domain/storage.types';
import { GitIntegrationConfig } from '@application/app-settings/domain/integration.types';
import { ClickUpConfig } from '@application/app-settings/domain/clickup.types';

export interface AppSettingsDoc {
  _id: string;
  tenantId: string;
  webhooks: WebhookConfig[];
  /** Connected GitHub / GitLab repos. Absent on tenants that predate the field. */
  integrations?: GitIntegrationConfig[];
  /** The connected ClickUp workspace. Absent until one is connected — which is
   *  also how "disconnected" is stored, so there's one empty state, not two. */
  clickup?: ClickUpConfig | null;
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
    integrations: { type: [Schema.Types.Mixed], default: [] } as unknown as GitIntegrationConfig[],
    // One mixed blob like `storage`: the API token lives here and is masked at
    // the edge (see `ClickUpSettingsResponseDto`), never returned to a client.
    clickup: { type: Schema.Types.Mixed, default: undefined } as unknown as ClickUpConfig,
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

// An inbound pipeline delivery carries nothing but the token in its URL — no
// session, no tenant header — so this is the lookup that resolves the workspace
// on every event. Multikey (the field is an array), sparse because most tenants
// have no integrations at all.
AppSettingsSchema.index({ 'integrations.token': 1 }, { sparse: true });

// The same job for ClickUp: an inbound delivery carries only the token in its
// URL, so this is what resolves the workspace on every event. Sparse because
// most tenants have no ClickUp connection at all.
AppSettingsSchema.index({ 'clickup.urlToken': 1 }, { sparse: true });
