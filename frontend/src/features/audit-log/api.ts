import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import type { AuditLogDto, ListResponse } from '@/types/dto';

export function useAuditLog(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['audit-log', projectId],
    queryFn: () =>
      apiGet<ListResponse<AuditLogDto>>(`/projects/${projectId}/audit-log`, {
        limit: 100,
      }),
    enabled: !!projectId && enabled,
  });
}
