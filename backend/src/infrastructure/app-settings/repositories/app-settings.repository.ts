import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import { AppSettingsEntity } from '@application/app-settings/domain/app-settings.entity';
import { TaskLabelConfig } from '@application/tasks/domain/enums/task.enums';
import { AppSettingsDoc } from '../entities/app-settings.schema';

@Injectable()
export class AppSettingsRepository implements IAppSettingsRepository {
  constructor(@InjectModel('AppSettings') private readonly model: Model<AppSettingsDoc>) {}

  private toDomain(doc: AppSettingsDoc): AppSettingsEntity {
    const result = AppSettingsEntity.create({
      tenantId: doc.tenantId,
      webhooks: doc.webhooks ?? [],
      integrations: doc.integrations ?? [],
      // `userMap` post-dates the first connections, and `clickup` is a Mixed
      // blob with no schema to default it — so a workspace connected before it
      // existed reads back without the field. Default here, once, rather than
      // leaving every consumer to guard against undefined.
      clickup: doc.clickup ? { ...doc.clickup, userMap: doc.clickup.userMap ?? [] } : null,
      bugStatuses: doc.bugStatuses,
      taskStatuses: doc.taskStatuses,
      storage: doc.storage,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  async findByTenant(tenantId: string): Promise<AppSettingsEntity | null> {
    const doc = await this.model.findOne({ tenantId }).lean<AppSettingsDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByIntegrationToken(token: string): Promise<AppSettingsEntity | null> {
    // Guard the empty string explicitly: `{ 'integrations.token': '' }` would
    // happily match a malformed stored config, and this is an unauthenticated
    // lookup — the token is the only thing standing between a caller and a
    // tenant, so it is never allowed to be blank.
    if (!token) return null;
    const doc = await this.model
      .findOne({ 'integrations.token': token })
      .lean<AppSettingsDoc>()
      .exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByClickUpToken(token: string): Promise<AppSettingsEntity | null> {
    // Guarded exactly like `findByIntegrationToken`: `{ 'clickup.urlToken': '' }`
    // would happily match a malformed stored config, and this is an
    // unauthenticated lookup where the token is the only thing standing between
    // a caller and a tenant.
    if (!token) return null;
    const doc = await this.model
      .findOne({ 'clickup.urlToken': token })
      .lean<AppSettingsDoc>()
      .exec();
    return doc ? this.toDomain(doc) : null;
  }

  async save(settings: AppSettingsEntity): Promise<void> {
    const clickup = settings.clickup;
    // Singleton per tenant — upsert by tenantId.
    await this.model
      .findOneAndUpdate(
        { tenantId: settings.tenantId },
        {
          $set: {
            tenantId: settings.tenantId,
            webhooks: settings.webhooks,
            integrations: settings.integrations,
            bugStatuses: settings.bugStatuses,
            taskStatuses: settings.taskStatuses,
            storage: settings.storage,
            ...(clickup ? { clickup } : {}),
          },
          // Disconnecting has to *remove* the field, not write null: the
          // `clickup.urlToken` index is sparse, and a null would leave a
          // document in it that an empty-token lookup could still reach.
          ...(clickup ? {} : { $unset: { clickup: 1 } }),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  /**
   * Legacy read of the workspace-wide task labels (now per-team). Only used by
   * the boot backfill; `.lean()` returns the raw field whether or not the domain
   * still maps it. Returns `[]` when absent — so a migrated tenant reads empty.
   */
  async findLegacyTaskLabels(tenantId: string): Promise<TaskLabelConfig[]> {
    const doc = await this.model
      .findOne({ tenantId })
      .select('taskLabels')
      .lean<{ taskLabels?: TaskLabelConfig[] }>()
      .exec();
    return doc?.taskLabels ?? [];
  }

  /** Drop the legacy field once its labels have been seeded onto the teams. */
  async clearLegacyTaskLabels(tenantId: string): Promise<void> {
    await this.model.updateOne({ tenantId }, { $unset: { taskLabels: 1 } }).exec();
  }
}
