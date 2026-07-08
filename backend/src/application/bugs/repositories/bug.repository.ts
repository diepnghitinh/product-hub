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
  findByTenant: (tenantId: string, query: QueryBugDto) => Promise<BugPaginationResponse>;
  countByStatus: (tenantId: string, status: string) => Promise<number>;
  save: (bug: BugEntity) => Promise<void>;
  update: (bug: BugEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}
