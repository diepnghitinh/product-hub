import { TaskLabelConfig } from '@application/tasks/domain/enums/task.enums';
import { AppSettingsEntity } from '../domain/app-settings.entity';

/** Port for the per-tenant settings singleton. */
export abstract class IAppSettingsRepository {
  findByTenant: (tenantId: string) => Promise<AppSettingsEntity | null>;
  save: (settings: AppSettingsEntity) => Promise<void>;
  /**
   * Resolve a git-integration webhook token to the tenant that owns it.
   *
   * The inbound leg has no session and no tenant header — the token in the URL
   * is the only thing identifying the workspace, which is why it's minted from
   * the unguessable share alphabet rather than being anything derivable.
   */
  findByIntegrationToken: (token: string) => Promise<AppSettingsEntity | null>;
  /** The same resolution for an inbound ClickUp delivery, keyed on its own token. */
  findByClickUpToken: (token: string) => Promise<AppSettingsEntity | null>;
  /**
   * Legacy: task labels used to live on settings (workspace-wide). They're now
   * per-team, so the boot backfill reads any stored ones to seed teams, then
   * {@link clearLegacyTaskLabels} removes them. No API path writes them anymore.
   */
  findLegacyTaskLabels: (tenantId: string) => Promise<TaskLabelConfig[]>;
  clearLegacyTaskLabels: (tenantId: string) => Promise<void>;
}
