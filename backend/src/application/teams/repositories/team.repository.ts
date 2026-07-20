import { TeamEntity } from '../domain/entities/team.entity';

/** Port for team persistence. All reads are tenant-scoped. */
export abstract class ITeamRepository {
  findByTenant: (tenantId: string) => Promise<TeamEntity[]>;
  findById: (tenantId: string, id: string) => Promise<TeamEntity | null>;
  findByKey: (tenantId: string, key: string) => Promise<TeamEntity | null>;
  findByPublicToken: (token: string) => Promise<TeamEntity | null>;
  /** Distinct tenant ids that have at least one team — drives the seed backfill. */
  tenantIdsWithTeams: () => Promise<string[]>;
  save: (team: TeamEntity) => Promise<void>;
}
