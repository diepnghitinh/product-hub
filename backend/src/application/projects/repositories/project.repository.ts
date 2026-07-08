import { ProjectEntity } from '../domain/entities/project.entity';
import { QueryProjectDto } from '../dtos/query-project.dto';

export interface ProjectPaginationResponse {
  data: ProjectEntity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Port for project persistence. Every read is tenant-scoped. `findByTenant`
 * returns active projects by default and archived ones when `query.archived` is
 * set. Slug uniqueness is checked among *active* projects only.
 */
export abstract class IProjectRepository {
  findById: (id: string) => Promise<ProjectEntity | null>;
  /** Public read: find an active, publicly-shared project by its token. */
  findByPublicToken: (token: string) => Promise<ProjectEntity | null>;
  findByTenant: (
    tenantId: string,
    query: QueryProjectDto,
  ) => Promise<ProjectPaginationResponse>;
  existsBySlug: (tenantId: string, slug: string) => Promise<boolean>;
  save: (project: ProjectEntity) => Promise<void>;
  update: (project: ProjectEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}
