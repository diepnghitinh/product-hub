import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import { ClickUpConfig, ClickUpSyncScope } from '@application/app-settings/domain/clickup.types';
import { ITeamRepository } from '@application/teams/repositories/team.repository';
import { IRoadmapRepository } from '@application/roadmaps/repositories/roadmap.repository';
import { DEFAULT_ROADMAP_COLUMNS } from '@application/roadmaps/domain/types/roadmap-item.type';
import {
  ClickUpApiError,
  ClickUpClient,
  ClickUpList,
  ClickUpListStatusInfo,
  ClickUpSpace,
} from '../domain/clickup.client';
import {
  autoMapStatuses,
  ClickUpStatusPair,
  OurColumn,
  reconcileMap,
} from '../domain/clickup-status-map';
import {
  ClickUpSyncBinding,
  IClickUpSyncRepository,
} from '../repositories/clickup-sync.repository';
import { SaveClickUpSyncDto } from '../dtos/clickup.dtos';

/**
 * Binding a board to a ClickUp list.
 *
 * Everything here is admin-facing configuration — nothing in this file moves a
 * card or writes a task. The push lives in `ClickUpSyncService`, the inbound
 * status in `ReceiveClickUpEventUseCase`; these use-cases only decide *what* the
 * two of them are pointed at.
 *
 * Two rules they all share:
 *
 * - **A board's columns are read live, never stored on the binding.** A team can
 *   add or rename a status at any time, and a mapping form showing the columns
 *   that existed when someone last pressed Save would quietly send work to the
 *   wrong place. Every read reconciles.
 * - **The connection is checked before ClickUp is called.** Reaching out with a
 *   missing or disabled token gives an admin a 401 from a third party instead of
 *   the sentence "ClickUp isn't connected".
 */

/** The bound-board view a settings form renders. */
export interface ClickUpSyncView {
  binding: ClickUpSyncBinding | null;
  /** Our columns in board order — the left-hand side of the mapping form. */
  columns: OurColumn[];
  /** The bound list's statuses; empty when unbound or when ClickUp couldn't be read. */
  listStatuses: ClickUpListStatusInfo[];
  /** The reconciled map, so the form never has to merge anything itself. */
  statusMap: ClickUpStatusPair[];
}

interface ScopeRequest {
  tenantId: string;
  scope: ClickUpSyncScope;
  scopeId: string;
}

/** Turn a ClickUp API failure into a sentence an admin can act on. */
function apiFailure(err: unknown): string {
  if (err instanceof ClickUpApiError) {
    if (err.status === 401) return 'ClickUp rejected the stored token. Reconnect it in Settings.';
    if (err.status === 403) return 'That token cannot see this space or list.';
    if (err.status === 404) return 'ClickUp could not find that space or list.';
    if (err.status === 429) return 'ClickUp is rate-limiting us. Try again in a minute.';
    if (err.status === 0) return `Could not reach ClickUp: ${err.message}`;
    return err.message;
  }
  return 'Could not reach ClickUp';
}

/**
 * The columns of one of our boards, whichever kind it is.
 *
 * The single place the two vocabularies meet: a team's `TeamStatusConfig` and a
 * roadmap's `RoadmapColumn` are the same idea under different names, and this is
 * what lets one binding shape, one mapping form and one status map serve both.
 */
@Injectable()
export class ClickUpScopeColumns {
  constructor(
    @Inject(ITeamRepository) private readonly teams: ITeamRepository,
    @Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository,
  ) {}

  /** `null` when the board doesn't exist (or belongs to another workspace). */
  async of(
    tenantId: string,
    scope: ClickUpSyncScope,
    scopeId: string,
  ): Promise<OurColumn[] | null> {
    if (scope === ClickUpSyncScope.TEAM) {
      const team = await this.teams.findById(tenantId, scopeId);
      if (!team) return null;
      // `statuses` already falls back to the kind's defaults for a team that
      // never configured its own, so an unconfigured board still maps.
      return team.statuses.map((s) => ({ key: s.key, label: s.label }));
    }
    const roadmap = await this.roadmaps.findById(scopeId);
    if (!roadmap || roadmap.tenantId !== tenantId) return null;
    const columns = roadmap.columns.length ? roadmap.columns : DEFAULT_ROADMAP_COLUMNS;
    return columns.map((c) => ({ key: c.key, label: c.label }));
  }
}

/** The connected ClickUp config, or a failure an admin can read. */
async function requireConnection(
  settings: IAppSettingsRepository,
  tenantId: string,
): Promise<Result<ClickUpConfig>> {
  const found = await settings.findByTenant(tenantId);
  const config = found?.clickup;
  if (!config?.apiToken) return Result.fail('ClickUp is not connected');
  if (!config.enabled) return Result.fail('The ClickUp integration is paused');
  return Result.ok(config);
}

/** The spaces in the connected workspace — the binding form's first picker. */
@Injectable()
export class GetClickUpSpacesUseCase implements IUsecaseExecute<
  { tenantId: string },
  Result<ClickUpSpace[]>
> {
  constructor(
    @Inject(IAppSettingsRepository) private readonly settings: IAppSettingsRepository,
    private readonly client: ClickUpClient,
  ) {}

  async execute({ tenantId }: { tenantId: string }): Promise<Result<ClickUpSpace[]>> {
    const connection = await requireConnection(this.settings, tenantId);
    if (connection.isFailure) return Result.fail(connection.error as string);
    const config = connection.getValue();
    try {
      return Result.ok(await this.client.listSpaces(config.apiToken, config.workspaceId));
    } catch (err) {
      return Result.fail(apiFailure(err));
    }
  }
}

/** Every list in one space, flattened across its folders. */
@Injectable()
export class GetClickUpListsUseCase implements IUsecaseExecute<
  { tenantId: string; spaceId: string },
  Result<ClickUpList[]>
> {
  constructor(
    @Inject(IAppSettingsRepository) private readonly settings: IAppSettingsRepository,
    private readonly client: ClickUpClient,
  ) {}

  async execute({
    tenantId,
    spaceId,
  }: {
    tenantId: string;
    spaceId: string;
  }): Promise<Result<ClickUpList[]>> {
    if (!spaceId) return Result.fail('Choose a space first');
    const connection = await requireConnection(this.settings, tenantId);
    if (connection.isFailure) return Result.fail(connection.error as string);
    try {
      return Result.ok(await this.client.listLists(connection.getValue().apiToken, spaceId));
    } catch (err) {
      return Result.fail(apiFailure(err));
    }
  }
}

/**
 * A list's statuses plus a **suggested** map onto a board's columns.
 *
 * Called when an admin picks a list, before anything is saved. The suggestion is
 * the whole reason this endpoint exists: the common case is that both boards use
 * the obvious words, and a form that arrives already filled in is one glance and
 * a Save rather than five dropdowns of tedium.
 */
@Injectable()
export class GetClickUpListStatusesUseCase implements IUsecaseExecute<
  ScopeRequest & { listId: string },
  Result<{ statuses: ClickUpListStatusInfo[]; suggested: ClickUpStatusPair[] }>
> {
  constructor(
    @Inject(IAppSettingsRepository) private readonly settings: IAppSettingsRepository,
    private readonly columns: ClickUpScopeColumns,
    private readonly client: ClickUpClient,
  ) {}

  async execute({
    tenantId,
    scope,
    scopeId,
    listId,
  }: ScopeRequest & { listId: string }): Promise<
    Result<{ statuses: ClickUpListStatusInfo[]; suggested: ClickUpStatusPair[] }>
  > {
    if (!listId) return Result.fail('Choose a list first');
    const connection = await requireConnection(this.settings, tenantId);
    if (connection.isFailure) return Result.fail(connection.error as string);

    const ours = await this.columns.of(tenantId, scope, scopeId);
    if (!ours) return Result.fail('Board not found');

    try {
      const statuses = await this.client.getListStatuses(connection.getValue().apiToken, listId);
      return Result.ok({ statuses, suggested: autoMapStatuses(ours, statuses) });
    } catch (err) {
      return Result.fail(apiFailure(err));
    }
  }
}

/** One board's binding, ready to render. */
@Injectable()
export class GetClickUpSyncUseCase implements IUsecaseExecute<
  ScopeRequest,
  Result<ClickUpSyncView>
> {
  constructor(
    @Inject(IClickUpSyncRepository) private readonly sync: IClickUpSyncRepository,
    @Inject(IAppSettingsRepository) private readonly settings: IAppSettingsRepository,
    private readonly columns: ClickUpScopeColumns,
    private readonly client: ClickUpClient,
  ) {}

  async execute({ tenantId, scope, scopeId }: ScopeRequest): Promise<Result<ClickUpSyncView>> {
    const ours = await this.columns.of(tenantId, scope, scopeId);
    if (!ours) return Result.fail('Board not found');

    const binding = await this.sync.findForScope(tenantId, scope, scopeId);
    if (!binding) {
      return Result.ok({ binding: null, columns: ours, listStatuses: [], statusMap: [] });
    }

    // Reconciled against today's columns, not the ones that existed at save time.
    const statusMap = reconcileMap(binding.statusMap, ours);

    // The list's statuses are a nicety, not the answer: if ClickUp is unreachable
    // the form still renders with the saved map and the columns, showing what is
    // configured rather than an error page over a working configuration.
    let listStatuses: ClickUpListStatusInfo[] = [];
    const found = await this.settings.findByTenant(tenantId);
    const config = found?.clickup;
    if (config?.apiToken && config.enabled) {
      listStatuses = await this.client
        .getListStatuses(config.apiToken, binding.listId)
        .catch(() => []);
    }

    return Result.ok({ binding, columns: ours, listStatuses, statusMap });
  }
}

/** Bind a board to a list, or re-save its mapping. */
@Injectable()
export class SaveClickUpSyncUseCase implements IUsecaseExecute<
  ScopeRequest & { dto: SaveClickUpSyncDto },
  Result<ClickUpSyncView>
> {
  constructor(
    @Inject(IClickUpSyncRepository) private readonly sync: IClickUpSyncRepository,
    @Inject(IAppSettingsRepository) private readonly settings: IAppSettingsRepository,
    private readonly columns: ClickUpScopeColumns,
    private readonly client: ClickUpClient,
  ) {}

  async execute({
    tenantId,
    scope,
    scopeId,
    dto,
  }: ScopeRequest & { dto: SaveClickUpSyncDto }): Promise<Result<ClickUpSyncView>> {
    const connection = await requireConnection(this.settings, tenantId);
    if (connection.isFailure) return Result.fail(connection.error as string);
    const config = connection.getValue();

    const ours = await this.columns.of(tenantId, scope, scopeId);
    if (!ours) return Result.fail('Board not found');
    if (!dto.listId) return Result.fail('Choose a ClickUp list');

    // Read the list before storing the binding. It proves the list exists and
    // the token can reach it, which turns "why is nothing syncing?" days later
    // into a sentence at the moment of saving.
    let listStatuses: ClickUpListStatusInfo[];
    try {
      listStatuses = await this.client.getListStatuses(config.apiToken, dto.listId);
    } catch (err) {
      return Result.fail(apiFailure(err));
    }

    // Keep only rows for columns this board actually has, and only statuses the
    // list actually defines. A stale row would push work into a status ClickUp
    // would reject — a 400 per save, silently, forever.
    const live = new Set(listStatuses.map((s) => s.name.trim().toLowerCase()));
    const sent = new Map(dto.statusMap.map((p) => [p.key, p.clickupStatus.trim()]));
    const statusMap: ClickUpStatusPair[] = ours.map((c) => {
      const wanted = sent.get(c.key) ?? '';
      const match = listStatuses.find((s) => s.name.trim().toLowerCase() === wanted.toLowerCase());
      return {
        key: c.key,
        clickupStatus: wanted && live.has(wanted.toLowerCase()) ? match!.name : '',
      };
    });

    const binding = await this.sync.save({
      tenantId,
      scope,
      scopeId,
      listId: dto.listId,
      listName: dto.listName ?? '',
      spaceId: dto.spaceId ?? '',
      spaceName: dto.spaceName ?? '',
      enabled: dto.enabled,
      statusMap,
    });

    return Result.ok({ binding, columns: ours, listStatuses, statusMap });
  }
}

/**
 * Unbind a board.
 *
 * Drops the binding and nothing else. The ClickUp tasks stay, and so do the
 * links beside each record — unbinding means "stop syncing", not "erase what
 * happened", and a workspace that re-binds the same list picks its tasks back up
 * exactly where they were.
 */
@Injectable()
export class DeleteClickUpSyncUseCase implements IUsecaseExecute<ScopeRequest, Result<boolean>> {
  constructor(@Inject(IClickUpSyncRepository) private readonly sync: IClickUpSyncRepository) {}

  async execute({ tenantId, scope, scopeId }: ScopeRequest): Promise<Result<boolean>> {
    return Result.ok(await this.sync.removeForScope(tenantId, scope, scopeId));
  }
}
