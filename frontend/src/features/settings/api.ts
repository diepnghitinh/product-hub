import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut } from '@/lib/api';
import type { AppSettingsDto, WebhookConfig } from '@/types/dto';
import type { BugStatusConfig } from '@/types/enums';

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

/** Bug board columns — readable by any authenticated user (drives the board). */
export function useBugStatuses() {
  return useQuery({
    queryKey: ['bug-statuses'],
    queryFn: () => apiGet<BugStatusConfig[]>('/settings/bug-statuses'),
  });
}

export function useUpdateBugStatuses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bugStatuses: BugStatusConfig[]) =>
      apiPut<AppSettingsDto>('/settings/bug-statuses', { bugStatuses }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['bug-statuses'] });
    },
  });
}
