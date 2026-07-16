import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { BUG_STATUSES } from '@application/bugs/domain/enums/bug.enums';
import { UpdateBugStatusesDto, UpdateWebhooksDto } from '../dtos/app-settings.dtos';
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

/**
 * Replace the tenant's bug board columns. v1 supports rename/recolor/reorder
 * only — so the provided keys must be exactly the fixed workflow set (each
 * status present once). This guarantees no bug is stranded on a removed status.
 */
@Injectable()
export class UpdateBugStatusesUseCase
  implements
    IUsecaseExecute<{ tenantId: string; dto: UpdateBugStatusesDto }, Result<AppSettingsEntity>>
{
  constructor(@Inject(IAppSettingsRepository) private readonly repo: IAppSettingsRepository) {}
  async execute({
    tenantId,
    dto,
  }: {
    tenantId: string;
    dto: UpdateBugStatusesDto;
  }): Promise<Result<AppSettingsEntity>> {
    const provided = dto.bugStatuses ?? [];
    const keys = provided.map((s) => s.key);
    const sameSet =
      keys.length === BUG_STATUSES.length &&
      new Set(keys).size === keys.length &&
      BUG_STATUSES.every((k) => keys.includes(k));
    if (!sameSet) {
      return Result.fail('bugStatuses must contain each workflow status exactly once');
    }
    if (provided.some((s) => !s.label?.trim())) {
      return Result.fail('Each status must have a non-empty label');
    }

    const cleaned = provided.map((s) => ({
      key: s.key,
      label: s.label.trim(),
      color: s.color?.trim() || '#6b7280',
    }));

    const settings = await loadOrDefault(this.repo, tenantId);
    settings.setBugStatuses(cleaned);
    await this.repo.save(settings);
    return Result.ok(settings);
  }
}
