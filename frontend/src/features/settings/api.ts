import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut } from '@/lib/api';
import type { AppSettingsDto, WebhookConfig } from '@/types/dto';

export function useSettings(enabled = true) {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiGet<AppSettingsDto>('/settings'),
    enabled,
  });
}

export function useUpdateWebhooks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (webhooks: WebhookConfig[]) =>
      apiPut<AppSettingsDto>('/settings/webhooks', { webhooks }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}
