import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { BUG_STATUSES } from '@application/bugs/domain/enums/bug.enums';
import { TASK_STATUSES } from '@application/tasks/domain/enums/task.enums';
import {
  UpdateBugStatusesDto,
  UpdateTaskLabelsDto,
  UpdateTaskStatusesDto,
  UpdateWebhooksDto,
} from '../dtos/app-settings.dtos';
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
