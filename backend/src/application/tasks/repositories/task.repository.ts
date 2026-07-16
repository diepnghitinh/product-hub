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
  findByTenant: (tenantId: string, query: QueryTaskDto) => Promise<TaskPaginationResponse>;
  save: (task: TaskEntity) => Promise<void>;
  update: (task: TaskEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}
