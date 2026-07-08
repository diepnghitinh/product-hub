import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { UpdateWebhooksDto } from '../dtos/app-settings.dtos';
import { AppSettingsEntity } from '../domain/app-settings.entity';
import { IAppSettingsRepository } from '../repositories/app-settings.repository';

/** Load the tenant's settings, creating an in-memory default if none exist yet. */
async function loadOrDefault(
  repo: IAppSettingsRepository,
  tenantId: string,
): Promise<AppSettingsEntity> {
  const existing = await repo.findByTenant(tenantId);
  if (existing) return existing;
  return AppSettingsEntity.create({ tenantId }).getValue();
}

@Injectable()
export class GetAppSettingsUseCase
  implements IUsecaseExecute<{ tenantId: string }, Result<AppSettingsEntity>>
{
  constructor(@Inject(IAppSettingsRepository) private readonly repo: IAppSettingsRepository) {}
  async execute({ tenantId }: { tenantId: string }): Promise<Result<AppSettingsEntity>> {
    return Result.ok(await loadOrDefault(this.repo, tenantId));
  }
}

@Injectable()
export class UpdateWebhooksUseCase
  implements
    IUsecaseExecute<{ tenantId: string; dto: UpdateWebhooksDto }, Result<AppSettingsEntity>>
{
  constructor(@Inject(IAppSettingsRepository) private readonly repo: IAppSettingsRepository) {}
  async execute({
    tenantId,
    dto,
  }: {
    tenantId: string;
    dto: UpdateWebhooksDto;
  }): Promise<Result<AppSettingsEntity>> {
    const settings = await loadOrDefault(this.repo, tenantId);
    settings.setWebhooks(dto.webhooks ?? []);
    await this.repo.save(settings);
    return Result.ok(settings);
  }
}
