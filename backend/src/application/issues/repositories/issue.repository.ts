import { IssueEntity } from '../domain/entities/issue.entity';
import { QueryIssueDto } from '../dtos/query-issue.dto';

export interface IssuePaginationResponse {
  data: IssueEntity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Port for issue persistence (the unified tasks+bugs store). All reads are
 *  tenant-scoped. */
export abstract class IIssueRepository {
  findById: (id: string) => Promise<IssueEntity | null>;
  /** Resolve by shortId (`TSK-7` / `BUG-12`) within a tenant, falling back to the
   *  uuid so links made before short ids existed keep working. */
  findByRef: (tenantId: string, ref: string) => Promise<IssueEntity | null>;
  /** Rows still missing a shortId — drives the one-off backfill. */
  findWithoutShortId: () => Promise<{ id: string; tenantId: string }[]>;
  setShortId: (id: string, shortId: string) => Promise<void>;
  /** File rows with no team into `teamId`; returns how many moved. */
  assignMissingTeam: (tenantId: string, teamId: string) => Promise<number>;
  /** `opts.personalOwnerId` scopes to that user's private personal board; without
   *  it the query excludes personal tasks (filters `ownerId: ''`). */
  findByTenant: (
    tenantId: string,
    query: QueryIssueDto,
    opts?: { personalOwnerId?: string },
  ) => Promise<IssuePaginationResponse>;
  countByStatus: (tenantId: string, status: string) => Promise<number>;
  save: (issue: IssueEntity) => Promise<void>;
  update: (issue: IssueEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}
