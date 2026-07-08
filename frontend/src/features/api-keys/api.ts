import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import type { ApiKeyDto, CreatedApiKeyDto } from '@/types/dto';

export function useApiKeys(enabled = true) {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiGet<ApiKeyDto[]>('/api-keys'),
    enabled,
  });
}

export function useGenerateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiPost<CreatedApiKeyDto>('/api-keys', { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}
