import { AppSettingsEntity } from '../domain/app-settings.entity';

/** Port for the per-tenant settings singleton. */
export abstract class IAppSettingsRepository {
  findByTenant: (tenantId: string) => Promise<AppSettingsEntity | null>;
  save: (settings: AppSettingsEntity) => Promise<void>;
}
