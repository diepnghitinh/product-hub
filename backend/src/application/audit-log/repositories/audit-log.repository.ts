import { AuditLogEntity } from '../domain/entities/audit-log.entity';
import { PaginationDto } from '@module-shared/modules/pagination/pagination.dto';

export interface AuditLogPaginationResponse {
  data: AuditLogEntity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Port for the append-only audit log. */
export abstract class IAuditLogRepository {
  append: (entry: AuditLogEntity) => Promise<void>;
  findByProject: (
    tenantId: string,
    projectId: string,
    query: PaginationDto,
  ) => Promise<AuditLogPaginationResponse>;
}
