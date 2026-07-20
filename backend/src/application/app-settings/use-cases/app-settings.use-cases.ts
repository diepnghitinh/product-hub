import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { BUG_STATUSES } from '@application/bugs/domain/enums/bug.enums';
import { TASK_STATUSES } from '@application/tasks/domain/enums/task.enums';
import {
  UpdateBugStatusesDto,
  UpdateStorageDto,
  UpdateTaskLabelsDto,
  UpdateTaskStatusesDto,
  UpdateWebhooksDto,
} from '../dtos/app-settings.dtos';
import { AppSettingsEntity } from '../domain/app-settings.entity';
import { IAppSettingsRepository } from '../repositories/app-settings.repository';
import {
  CloudStorageConfig,
  DEFAULT_MAX_IMAGE_MB,
  DEFAULT_MAX_VIDEO_MB,
} from '../domain/storage.types';

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
 * Replace the tenant's bug board columns. Admins may relabel/recolour/reorder,
 * and **add custom columns** — but every built-in status must remain (so no bug
 * is ever stranded on a removed status, and rollups/filters keep working). Keys
 * must be unique; the DTO enforces each is a slug.
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
    if (new Set(keys).size !== keys.length) {
      return Result.fail('Status keys must be unique');
    }
    if (!BUG_STATUSES.every((k) => keys.includes(k))) {
      return Result.fail('The built-in statuses cannot be removed');
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

/**
 * Replace the tenant's task board columns. Same rules as bugs: built-ins must
 * remain, keys unique, labels non-empty; custom columns allowed.
 */
@Injectable()
export class UpdateTaskStatusesUseCase
  implements
    IUsecaseExecute<{ tenantId: string; dto: UpdateTaskStatusesDto }, Result<AppSettingsEntity>>
{
  constructor(@Inject(IAppSettingsRepository) private readonly repo: IAppSettingsRepository) {}
  async execute({
    tenantId,
    dto,
  }: {
    tenantId: string;
    dto: UpdateTaskStatusesDto;
  }): Promise<Result<AppSettingsEntity>> {
    const provided = dto.taskStatuses ?? [];
    const keys = provided.map((s) => s.key);
    if (new Set(keys).size !== keys.length) {
      return Result.fail('Status keys must be unique');
    }
    if (!TASK_STATUSES.every((k) => keys.includes(k))) {
      return Result.fail('The built-in statuses cannot be removed');
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
    settings.setTaskStatuses(cleaned);
    await this.repo.save(settings);
    return Result.ok(settings);
  }
}

/**
 * Replace the tenant's task labels. Unlike statuses there are no built-ins to
 * protect and an empty list is valid — only uniqueness + a name are required.
 */
@Injectable()
export class UpdateTaskLabelsUseCase
  implements
    IUsecaseExecute<{ tenantId: string; dto: UpdateTaskLabelsDto }, Result<AppSettingsEntity>>
{
  constructor(@Inject(IAppSettingsRepository) private readonly repo: IAppSettingsRepository) {}
  async execute({
    tenantId,
    dto,
  }: {
    tenantId: string;
    dto: UpdateTaskLabelsDto;
  }): Promise<Result<AppSettingsEntity>> {
    const provided = dto.taskLabels ?? [];
    const keys = provided.map((l) => l.key);
    if (new Set(keys).size !== keys.length) {
      return Result.fail('Label keys must be unique');
    }
    if (provided.some((l) => !l.name?.trim())) {
      return Result.fail('Each label must have a non-empty name');
    }

    const cleaned = provided.map((l) => ({
      key: l.key,
      name: l.name.trim(),
      color: l.color?.trim() || '#6b7280',
    }));

    const settings = await loadOrDefault(this.repo, tenantId);
    settings.setTaskLabels(cleaned);
    await this.repo.save(settings);
    return Result.ok(settings);
  }
}

/**
 * Merge a storage update onto the current config. Non-secret fields are a
 * straight replace (blank clears them); the two secrets are kept when the client
 * sends nothing, so a masked form round-trips without wiping stored credentials.
 */
export function mergeStorageConfig(
  current: CloudStorageConfig,
  dto: UpdateStorageDto,
): CloudStorageConfig {
  const clean = (s?: string) => {
    const v = s?.trim();
    return v ? v : undefined;
  };
  return {
    provider: dto.provider,
    s3Region: clean(dto.s3Region),
    s3Bucket: clean(dto.s3Bucket),
    s3AccessKeyId: clean(dto.s3AccessKeyId),
    s3SecretAccessKey: clean(dto.s3SecretAccessKey) ?? current.s3SecretAccessKey,
    s3Endpoint: clean(dto.s3Endpoint),
    s3PublicBaseUrl: clean(dto.s3PublicBaseUrl),
    azureConnectionString: clean(dto.azureConnectionString) ?? current.azureConnectionString,
    azureContainer: clean(dto.azureContainer),
    maxVideoMb: dto.maxVideoMb ?? current.maxVideoMb ?? DEFAULT_MAX_VIDEO_MB,
    maxImageMb: dto.maxImageMb ?? current.maxImageMb ?? DEFAULT_MAX_IMAGE_MB,
  };
}

/**
 * Update the tenant's cloud-storage config. Secrets are write-only: a blank
 * `s3SecretAccessKey` / `azureConnectionString` keeps whatever is stored, so the
 * client never has to (and never gets to) read them back. Everything else is a
 * straight replace from the form.
 */
@Injectable()
export class UpdateStorageUseCase
  implements
    IUsecaseExecute<{ tenantId: string; dto: UpdateStorageDto }, Result<AppSettingsEntity>>
{
  constructor(@Inject(IAppSettingsRepository) private readonly repo: IAppSettingsRepository) {}
  async execute({
    tenantId,
    dto,
  }: {
    tenantId: string;
    dto: UpdateStorageDto;
  }): Promise<Result<AppSettingsEntity>> {
    const settings = await loadOrDefault(this.repo, tenantId);
    settings.setStorage(mergeStorageConfig(settings.storage, dto));
    await this.repo.save(settings);
    return Result.ok(settings);
  }
}
