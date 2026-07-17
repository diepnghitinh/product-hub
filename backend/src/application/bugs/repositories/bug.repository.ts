import { BugEntity } from '../domain/entities/bug.entity';
import { QueryBugDto } from '../dtos/query-bug.dto';

export interface BugPaginationResponse {
  data: BugEntity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Port for bug persistence. All reads are tenant-scoped. */
export abstract class IBugRepository {
  findById: (id: string) => Promise<BugEntity | null>;
  /** Resolve by shortId (`BUG-12`) within a tenant, falling back to the uuid so
   * links made before short ids existed keep working. */
  findByRef: (tenantId: string, ref: string) => Promise<BugEntity | null>;
  /** Rows still missing a shortId — drives the one-off backfill. */
  findWithoutShortId: () => Promise<{ id: string; tenantId: string }[]>;
  setShortId: (id: string, shortId: string) => Promise<void>;
  /** File rows with no team into `teamId`; returns how many moved. */
  assignMissingTeam: (tenantId: string, teamId: string) => Promise<number>;
  findByTenant: (tenantId: string, query: QueryBugDto) => Promise<BugPaginationResponse>;
  countByStatus: (tenantId: string, status: string) => Promise<number>;
  save: (bug: BugEntity) => Promise<void>;
  update: (bug: BugEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}
