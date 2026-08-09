import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { AppSettingsEntity } from '@application/app-settings/domain/app-settings.entity';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import {
  BUILTIN_ROADMAP_TEMPLATE_ID,
  defaultRoadmapTemplates,
  RoadmapColumn,
  RoadmapColumnTemplate,
} from '../domain/types/roadmap-item.type';
import { ReplaceRoadmapTemplatesDto } from '../dtos/roadmap.dtos';
import { IRoadmapRepository } from '../repositories/roadmap.repository';

/**
 * The workspace's roadmap column templates — the *global* side of how a backlog
 * board is laid out. They live on the app-settings singleton (one document per
 * tenant, like team statuses used to) but are read and written through their own
 * routes, because every roadmap board needs to read them and `GET /settings` is
 * admin-only.
 */

async function loadOrDefault(
  repo: IAppSettingsRepository,
  tenantId: string,
): Promise<AppSettingsEntity> {
  return (await repo.findByTenant(tenantId)) ?? AppSettingsEntity.create({ tenantId }).getValue();
}

/**
 * The list every "what are this roadmap's columns, really?" question resolves
 * against — pair it with `resolveRoadmapColumns`, because a linked roadmap's own
 * `columns` array is the dormant one.
 *
 * A workspace that has never opened settings has no document at all, and the
 * built-in is still what its roadmaps point at, so that's what comes back rather
 * than an empty list that would read as "templates aren't set up".
 */
export async function tenantTemplates(
  repo: IAppSettingsRepository,
  tenantId: string,
): Promise<RoadmapColumnTemplate[]> {
  const settings = await repo.findByTenant(tenantId);
  return settings?.roadmapColumnTemplates ?? defaultRoadmapTemplates();
}

@Injectable()
export class GetRoadmapTemplatesUseCase
  implements IUsecaseExecute<{ tenantId: string }, Result<RoadmapColumnTemplate[]>>
{
  constructor(@Inject(IAppSettingsRepository) private readonly settings: IAppSettingsRepository) {}

  async execute({ tenantId }: { tenantId: string }): Promise<Result<RoadmapColumnTemplate[]>> {
    return Result.ok(await tenantTemplates(this.settings, tenantId));
  }
}

/** Drop unnamed/empty rows and keep a column's `key` stable — items store it. */
function cleanColumns(columns: RoadmapColumn[]): RoadmapColumn[] {
  const seen = new Set<string>();
  const out: RoadmapColumn[] = [];
  for (const col of columns ?? []) {
    const label = (col?.label ?? '').trim();
    if (!col?.key || !label || seen.has(col.key)) continue;
    seen.add(col.key);
    out.push({ key: col.key, label, color: col.color });
  }
  return out;
}

/**
 * Replace the whole template list.
 *
 * Two things make this more than a write:
 *
 * **The built-in survives.** It's the fallback every roadmap can point at, so a
 * client that omits it gets it put back rather than leaving a workspace with no
 * templates (which the entity would re-seed on the next read anyway — better to
 * be honest about it at the point of the save).
 *
 * **Deleting a template doesn't move anyone's board.** A roadmap linked to a
 * removed template would otherwise fall back to its own dormant `columns` — a
 * set it may not have used for months — and every item sitting in a column the
 * template defined would vanish from the board. So the template's columns are
 * copied down onto each roadmap that used it, which is exactly "go custom,
 * keeping what's on screen".
 */
@Injectable()
export class ReplaceRoadmapTemplatesUseCase
  implements
    IUsecaseExecute<
      { tenantId: string; dto: ReplaceRoadmapTemplatesDto },
      Result<RoadmapColumnTemplate[]>
    >
{
  constructor(
    @Inject(IAppSettingsRepository) private readonly settings: IAppSettingsRepository,
    @Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository,
  ) {}

  async execute({
    tenantId,
    dto,
  }: {
    tenantId: string;
    dto: ReplaceRoadmapTemplatesDto;
  }): Promise<Result<RoadmapColumnTemplate[]>> {
    const settings = await loadOrDefault(this.settings, tenantId);
    const before = settings.roadmapColumnTemplates;

    const seen = new Set<string>();
    const next: RoadmapColumnTemplate[] = [];
    for (const tpl of dto.templates ?? []) {
      const name = (tpl?.name ?? '').trim();
      const columns = cleanColumns(tpl?.columns);
      // A template with no columns is a board with nothing on it — dropped
      // rather than saved, same rule the per-roadmap editor enforces.
      if (!tpl?.id || !name || !columns.length || seen.has(tpl.id)) continue;
      seen.add(tpl.id);
      next.push({ id: tpl.id, name, columns, isDefault: false });
    }

    if (!next.some((tpl) => tpl.id === BUILTIN_ROADMAP_TEMPLATE_ID)) {
      next.unshift(...defaultRoadmapTemplates());
    }

    // Exactly one default — the flag decides where new roadmaps start, so two of
    // them (or none) would make that unanswerable. First one wins; the built-in
    // takes it if the client marked nothing.
    const wanted = (dto.templates ?? []).find((tpl) => tpl?.isDefault && seen.has(tpl.id))?.id;
    const defaultId = wanted ?? BUILTIN_ROADMAP_TEMPLATE_ID;
    const templates = next.map((tpl) => ({ ...tpl, isDefault: tpl.id === defaultId }));

    settings.setRoadmapColumnTemplates(templates);
    await this.settings.save(settings);

    const live = new Set(templates.map((tpl) => tpl.id));
    const removed = before.filter((tpl) => !live.has(tpl.id));
    if (removed.length) await this.detach(tenantId, removed);

    return Result.ok(templates);
  }

  /** Copy each deleted template's columns onto the roadmaps that were reading
   *  them, so those boards look exactly the same afterwards — just custom. */
  private async detach(tenantId: string, removed: RoadmapColumnTemplate[]): Promise<void> {
    const byId = new Map(removed.map((tpl) => [tpl.id, tpl]));
    const all = await this.roadmaps.findByTenant(tenantId);
    for (const roadmap of all) {
      const orphaned = roadmap.columnTemplateId && byId.get(roadmap.columnTemplateId);
      if (!orphaned) continue;
      // Clears the link as well — see `RoadmapEntity.replaceColumns`.
      roadmap.replaceColumns(orphaned.columns);
      await this.roadmaps.update(roadmap);
    }
  }
}
