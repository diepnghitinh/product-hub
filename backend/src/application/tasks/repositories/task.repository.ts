import { TaskEntity } from '../domain/entities/task.entity';
import { QueryTaskDto } from '../dtos/query-task.dto';

export interface TaskPaginationResponse {
  data: TaskEntity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Port for task persistence. All reads are tenant-scoped. */
export abstract class ITaskRepository {
  findById: (id: string) => Promise<TaskEntity | null>;
  /** Resolve by shortId (`TSK-7`) within a tenant, falling back to the uuid so
   * links made before short ids existed keep working. */
  findByRef: (tenantId: string, ref: string) => Promise<TaskEntity | null>;
  /** Rows still missing a shortId — drives the one-off backfill. */
  findWithoutShortId: () => Promise<{ id: string; tenantId: string }[]>;
  setShortId: (id: string, shortId: string) => Promise<void>;
  /** File rows with no team into `teamId`; returns how many moved. */
  assignMissingTeam: (tenantId: string, teamId: string) => Promise<number>;
  /** `opts.personalOwnerId` scopes to that user's private personal board; without
   *  it the query excludes personal tasks (filters `ownerId: ''`). */
  findByTenant: (
    tenantId: string,
    query: QueryTaskDto,
    opts?: { personalOwnerId?: string },
  ) => Promise<TaskPaginationResponse>;
  save: (task: TaskEntity) => Promise<void>;
  update: (task: TaskEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}
