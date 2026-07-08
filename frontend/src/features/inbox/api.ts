import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import type { InboxResponseDto } from '@/types/dto';

export function useInbox() {
  return useQuery({
    queryKey: ['inbox'],
    queryFn: () => apiGet<InboxResponseDto>('/inbox'),
    // Poll so the topbar badge stays roughly fresh.
    refetchInterval: 60_000,
  });
}

export function useMarkInboxSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ ok: true }>('/inbox/seen'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  });
}
