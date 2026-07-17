import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { uniqueSlug } from '@module-shared/utils/slug.util';
import { CreateTeamDto, UpdateTeamDto, UpdateTeamStatusesDto } from '../dtos/team.dtos';
import { TeamEntity } from '../domain/entities/team.entity';
import { DEFAULT_TEAMS } from '../domain/enums/team.enums';
import { ITeamRepository } from '../repositories/team.repository';

/**
 * Guarantees a workspace has its two default teams (QC · Engineering). Called
 * on registration and by the boot backfill for workspaces that predate teams.
 * Idempotent: only creates what's missing.
 */
@Injectable()
export class EnsureDefaultTeamsUseCase
  implements IUsecaseExecute<{ tenantId: string }, Result<TeamEntity[]>>
{
  constructor(@Inject(ITeamRepository) private readonly teams: ITeamRepository) {}

  async execute({ tenantId }: { tenantId: string }): Promise<Result<TeamEntity[]>> {
    const created: TeamEntity[] = [];
    for (const [i, def] of DEFAULT_TEAMS.entries()) {
      const existing = await this.teams.findByKey(tenantId, def.key);
      if (existing) continue;
      const result = TeamEntity.create({
        tenantId,
        key: def.key,
        name: def.name,
        issueType: def.issueType,
        order: i,
      });
      if (result.isFailure) return Result.fail(result.error as string);
      const team = result.getValue();
      await this.teams.save(team);
      created.push(team);
    }
    return Result.ok(created);
  }
}

@Injectable()
export class GetTeamsUseCase
  implements IUsecaseExecute<{ tenantId: string }, Result<TeamEntity[]>>
{
  constructor(@Inject(ITeamRepository) private readonly teams: ITeamRepository) {}

  async execute({ tenantId }: { tenantId: string }): Promise<Result<TeamEntity[]>> {
    return Result.ok(await this.teams.findByTenant(tenantId));
  }
}

@Injectable()
export class CreateTeamUseCase
  implements IUsecaseExecute<{ tenantId: string; dto: CreateTeamDto }, Result<TeamEntity>>
{
  constructor(@Inject(ITeamRepository) private readonly teams: ITeamRepository) {}

  async execute({
    tenantId,
    dto,
  }: {
    tenantId: string;
    dto: CreateTeamDto;
  }): Promise<Result<TeamEntity>> {
    // Key is derived from the name, then de-duplicated — it's the stable id.
    const key = await uniqueSlug(dto.name, async (c) => !!(await this.teams.findByKey(tenantId, c)));

    const existing = await this.teams.findByTenant(tenantId);
    const result = TeamEntity.create({
      tenantId,
      key,
      name: dto.name,
      issueType: dto.issueType,
      icon: dto.icon,
      order: existing.length,
    });
    if (result.isFailure) return Result.fail(result.error as string);
    const team = result.getValue();
    await this.teams.save(team);
    return Result.ok(team);
  }
}

/** Sentinel so the controller can map "can't archive a default team" to 400. */
export const TEAM_DEFAULT_LOCKED = 'The default teams cannot be archived';

/** Sentinel so the controller can tell a missing team from a rejected write. */
export const TEAM_NOT_FOUND = 'Team not found';

@Injectable()
export class UpdateTeamUseCase
  implements
    IUsecaseExecute<{ tenantId: string; id: string; dto: UpdateTeamDto }, Result<TeamEntity>>
{
  constructor(@Inject(ITeamRepository) private readonly teams: ITeamRepository) {}

  async execute({
    tenantId,
    id,
    dto,
  }: {
    tenantId: string;
    id: string;
    dto: UpdateTeamDto;
  }): Promise<Result<TeamEntity>> {
    const team = await this.teams.findById(tenantId, id);
    if (!team) return Result.fail(TEAM_NOT_FOUND);

    if (dto.name !== undefined) {
      const renamed = team.rename(dto.name);
      if (renamed.isFailure) return Result.fail(renamed.error as string);
    }
    if (dto.icon !== undefined) {
      team.setIcon(dto.icon);
    }
    if (dto.archived !== undefined) {
      const archived = team.setArchived(dto.archived);
      if (archived.isFailure) return Result.fail(archived.error as string);
    }

    await this.teams.save(team);
    return Result.ok(team);
  }
}


/** Replace a team's board columns. Built-ins are enforced by the entity. */
@Injectable()
export class UpdateTeamStatusesUseCase
  implements
    IUsecaseExecute<
      { tenantId: string; id: string; dto: UpdateTeamStatusesDto },
      Result<TeamEntity>
    >
{
  constructor(@Inject(ITeamRepository) private readonly teams: ITeamRepository) {}

  async execute({
    tenantId,
    id,
    dto,
  }: {
    tenantId: string;
    id: string;
    dto: UpdateTeamStatusesDto;
  }): Promise<Result<TeamEntity>> {
    const team = await this.teams.findById(tenantId, id);
    if (!team) return Result.fail(TEAM_NOT_FOUND);

    const set = team.setStatuses(dto.statuses);
    if (set.isFailure) return Result.fail(set.error as string);

    await this.teams.save(team);
    return Result.ok(team);
  }
}
