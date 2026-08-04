import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import type { ApiKeyScope } from '@/types/enums';
import type { ApiKeyDto, CreatedApiKeyDto } from '@/types/dto';

/** Generating a key now carries its scope — the ceiling on what MCP writes it
 *  may perform. Omitting it lets the API apply its read-only default. */
export interface GenerateApiKeyInput {
  name: string;
  scope: ApiKeyScope;
}

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
    mutationFn: ({ name, scope }: GenerateApiKeyInput) =>
      apiPost<CreatedApiKeyDto>('/api-keys', { name, scope }),
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
