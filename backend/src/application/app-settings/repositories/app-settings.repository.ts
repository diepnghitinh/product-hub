import { TaskLabelConfig } from '@application/tasks/domain/enums/task.enums';
import { AppSettingsEntity } from '../domain/app-settings.entity';

/** Port for the per-tenant settings singleton. */
export abstract class IAppSettingsRepository {
  findByTenant: (tenantId: string) => Promise<AppSettingsEntity | null>;
  save: (settings: AppSettingsEntity) => Promise<void>;
  /**
   * Legacy: task labels used to live on settings (workspace-wide). They're now
   * per-team, so the boot backfill reads any stored ones to seed teams, then
   * {@link clearLegacyTaskLabels} removes them. No API path writes them anymore.
   */
  findLegacyTaskLabels: (tenantId: string) => Promise<TaskLabelConfig[]>;
  clearLegacyTaskLabels: (tenantId: string) => Promise<void>;
}
