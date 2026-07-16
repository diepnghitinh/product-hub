import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import { AppSettingsEntity } from '@application/app-settings/domain/app-settings.entity';
import { AppSettingsDoc } from '../entities/app-settings.schema';

@Injectable()
export class AppSettingsRepository implements IAppSettingsRepository {
  constructor(@InjectModel('AppSettings') private readonly model: Model<AppSettingsDoc>) {}

  private toDomain(doc: AppSettingsDoc): AppSettingsEntity {
    const result = AppSettingsEntity.create({
      tenantId: doc.tenantId,
      webhooks: doc.webhooks ?? [],
      bugStatuses: doc.bugStatuses,
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

  async save(settings: AppSettingsEntity): Promise<void> {
    // Singleton per tenant — upsert by tenantId.
    await this.model
      .findOneAndUpdate(
        { tenantId: settings.tenantId },
        {
          tenantId: settings.tenantId,
          webhooks: settings.webhooks,
          bugStatuses: settings.bugStatuses,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
  }
}
