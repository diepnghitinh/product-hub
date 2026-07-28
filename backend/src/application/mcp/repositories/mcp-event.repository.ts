import { PaginationDto } from '@module-shared/modules/pagination/pagination.dto';
import { McpEventEntity } from '../domain/entities/mcp-event.entity';

export interface McpEventPaginationResponse {
  data: McpEventEntity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Port for the append-only log of everything MCP created. */
export abstract class IMcpEventRepository {
  append: (event: McpEventEntity) => Promise<void>;
  findByTenant: (
    tenantId: string,
    query: PaginationDto,
  ) => Promise<McpEventPaginationResponse>;
}
