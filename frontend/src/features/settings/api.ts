import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type { AppSettingsDto, GitIntegrationDto, WebhookConfig } from '@/types/dto';
import type { GitProvider, StorageProvider } from '@/types/enums';

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
  maxDocMb?: number;
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

// ── Git integrations ─────────────────────────────────────────────────────────
const INTEGRATIONS_KEY = ['settings', 'integrations'];

/**
 * Connected GitHub/GitLab repos. A separate query from `useSettings` because the
 * response carries each repo's signing secret — it should be fetched by the one
 * screen that shows it, not by every consumer of app settings.
 */
export function useIntegrations(enabled = true) {
  return useQuery({
    queryKey: INTEGRATIONS_KEY,
    queryFn: () => apiGet<GitIntegrationDto[]>('/settings/integrations'),
    enabled,
  });
}

/**
 * Add or rename a repo. `token`/`secret` are deliberately absent: the server
 * mints them, and an edit leaves the existing pair alone so the webhook already
 * pasted into the repo keeps working.
 */
export interface SaveIntegrationPayload {
  /** Omit to add; pass an existing id to edit. */
  id?: string;
  provider: GitProvider;
  name: string;
  enabled?: boolean;
}

/** Every mutation returns the full list, so the cache is set, not invalidated. */
function useIntegrationMutation<TInput>(fn: (input: TInput) => Promise<GitIntegrationDto[]>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (list) => qc.setQueryData(INTEGRATIONS_KEY, list),
  });
}

export function useSaveIntegration() {
  return useIntegrationMutation((input: SaveIntegrationPayload) =>
    apiPut<GitIntegrationDto[]>('/settings/integrations', input),
  );
}

/** Mint a new URL + secret for one repo — both change, so the repo must be re-pasted. */
export function useRotateIntegrationSecret() {
  return useIntegrationMutation((id: string) =>
    apiPost<GitIntegrationDto[]>(`/settings/integrations/${id}/rotate`, {}),
  );
}

export function useDeleteIntegration() {
  return useIntegrationMutation((id: string) =>
    apiDelete<GitIntegrationDto[]>(`/settings/integrations/${id}`),
  );
}
