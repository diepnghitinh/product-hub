import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  AppSettingsDto,
  ClickUpPeopleDto,
  ClickUpSettingsDto,
  ClickUpWorkspaceDto,
  GitIntegrationDto,
  WebhookConfig,
} from '@/types/dto';
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

// ── ClickUp ──────────────────────────────────────────────────────────────────
const CLICKUP_KEY = ['settings', 'clickup'];

/** The connected workspace (admin). Its own query — see `useIntegrations`. */
export function useClickUpSettings(enabled = true) {
  return useQuery({
    queryKey: CLICKUP_KEY,
    queryFn: () => apiGet<ClickUpSettingsDto>('/settings/clickup'),
    enabled,
  });
}

/**
 * Step one of connecting: hand a token to the server, get back the workspaces
 * it can see. A mutation rather than a query because it has to be *run*, and
 * because caching a response keyed by a credential is a thing not to do.
 */
export function useProbeClickUp() {
  return useMutation({
    mutationFn: (apiToken: string) =>
      apiPost<ClickUpWorkspaceDto[]>('/settings/clickup/probe', { apiToken }),
  });
}

export interface ConnectClickUpPayload {
  apiToken: string;
  workspaceId: string;
  workspaceName?: string;
}

/** Every mutation returns the whole object, so the cache is set, not invalidated. */
function useClickUpMutation<TInput>(fn: (input: TInput) => Promise<ClickUpSettingsDto>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (settings) => {
      qc.setQueryData(CLICKUP_KEY, settings);
      // The Link button on every issue keys off `status`, and the link rows
      // themselves are gone after a disconnect. Connecting, pausing and
      // disconnecting all change one or both, so all three refetch them.
      qc.invalidateQueries({ queryKey: ['clickup', 'status'] });
      qc.invalidateQueries({ queryKey: ['clickup', 'links'] });
    },
  });
}

export function useConnectClickUp() {
  return useClickUpMutation((input: ConnectClickUpPayload) =>
    apiPost<ClickUpSettingsDto>('/settings/clickup', input),
  );
}

export function useSetClickUpEnabled() {
  return useClickUpMutation((enabled: boolean) =>
    apiPut<ClickUpSettingsDto>('/settings/clickup', { enabled }),
  );
}

/** Deletes the webhook in ClickUp, drops the token, and removes every link. */
export function useDisconnectClickUp() {
  return useClickUpMutation(() => apiDelete<ClickUpSettingsDto>('/settings/clickup'));
}

const CLICKUP_PEOPLE_KEY = ['settings', 'clickup', 'people'];

/**
 * Everyone here, next to their ClickUp seat.
 *
 * Not cached beyond the screen: the rows are *resolved* server-side, so the
 * answer changes when somebody joins either system, and a stale table would
 * claim a person syncs when they no longer do.
 */
export function useClickUpPeople(enabled = true) {
  return useQuery({
    queryKey: CLICKUP_PEOPLE_KEY,
    queryFn: () => apiGet<ClickUpPeopleDto>('/settings/clickup/people'),
    enabled,
  });
}

/**
 * Replace the whole map. `memberId: 0` removes a pin and hands the row back to
 * the email match — which is why the server answers with the re-resolved table
 * rather than an echo, and why that answer is written straight into the cache.
 */
export function useSaveClickUpPeople() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (people: { userId: string; memberId: number }[]) =>
      apiPut<ClickUpPeopleDto>('/settings/clickup/people', { people }),
    onSuccess: (fresh) => qc.setQueryData(CLICKUP_PEOPLE_KEY, fresh),
  });
}
