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

  async save(settings: AppSettingsEntity): Promise<void> {
    // Singleton per tenant — upsert by tenantId.
    await this.model
      .findOneAndUpdate(
        { tenantId: settings.tenantId },
        {
          tenantId: settings.tenantId,
          webhooks: settings.webhooks,
          integrations: settings.integrations,
          bugStatuses: settings.bugStatuses,
          taskStatuses: settings.taskStatuses,
          storage: settings.storage,
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
