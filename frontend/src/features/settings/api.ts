import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut } from '@/lib/api';
import type { AppSettingsDto, WebhookConfig } from '@/types/dto';
import type { TaskLabelConfig } from '@/types/enums';

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

/** Task labels — readable by any authenticated user (they render on tasks). */
export function useTaskLabels() {
  return useQuery({
    queryKey: ['task-labels'],
    queryFn: () => apiGet<TaskLabelConfig[]>('/settings/task-labels'),
  });
}

export function useUpdateTaskLabels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskLabels: TaskLabelConfig[]) =>
      apiPut<AppSettingsDto>('/settings/task-labels', { taskLabels }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['task-labels'] });
    },
  });
}
