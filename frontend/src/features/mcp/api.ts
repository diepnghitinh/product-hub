import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import type { ListResponse, McpEventDto } from '@/types/dto';

/**
 * What an MCP client has created in this workspace, newest first.
 *
 * Read-only by design: the log is appended by the API on every successful MCP
 * write, so there is nothing here to create, edit or delete.
 */
export function useMcpEvents(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['mcp-events', page, limit],
    queryFn: () => apiGet<ListResponse<McpEventDto>>('/mcp/events', { page, limit }),
  });
}
