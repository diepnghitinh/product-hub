import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import type { AppSettingsDto, WebhookConfig } from '@/types/dto';
import type { StorageProvider } from '@/types/enums';

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

/** Storage update payload. Secrets are write-only — send to set, omit to keep. */
export interface UpdateStoragePayload {
  provider: StorageProvider;
  s3Region?: string;
  s3Bucket?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3Endpoint?: string;
  s3PublicBaseUrl?: string;
  azureConnectionString?: string;
  azureContainer?: string;
  maxVideoMb?: number;
  maxImageMb?: number;
}

/** Save the tenant's cloud-storage config (admin). */
export function useUpdateStorage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateStoragePayload) =>
      apiPut<AppSettingsDto>('/settings/storage', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}

/** Check the storage credentials without saving (admin). Throws with the reason. */
export function useTestStorageConnection() {
  return useMutation({
    mutationFn: (input: UpdateStoragePayload) =>
      apiPost<{ ok: true }>('/uploads/test-connection', input),
  });
}
