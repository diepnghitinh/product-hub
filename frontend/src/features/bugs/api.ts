import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { t } from '@/i18n';
import type { BugAttachment, BugDto, ListResponse } from '@/types/dto';
import type { BugSeverity, BugStatus, CustomFieldValue } from '@/types/enums';

export interface BugQuery {
  /** Scope to a team's issue list. */
  teamId?: string;
  /** Multi-value — serialized as repeated keys (`?status=a&status=b`). */
  status?: BugStatus[];
  severity?: BugSeverity[];
  assigneeId?: string[];
  projectId?: string[];
  caseId?: string;
  reportId?: string;
  search?: string;
}

export interface CreateBugInput {
  title: string;
  description?: string;
  severity?: BugSeverity;
  /** Built-in `BugStatus` or a team's custom column key. Defaults to the first column. */
  status?: string;
  type?: string;
  projectId?: string;
  caseId?: string;
  caseLabel?: string;
  reportId?: string;
  assigneeId?: string;
  /**
   * The team whose list to create in. Must be sent from a team's board —
   * without it the API files the bug under the workspace's default bug team,
   * not the one you were looking at.
   */
  teamId?: string;
}

export interface UpdateBugInput {
  title?: string;
  description?: string;
  severity?: BugSeverity;
  type?: string;
  projectId?: string;
  caseId?: string;
  caseLabel?: string;
  reportId?: string;
  assigneeId?: string;
  attachments?: BugAttachment[];
  /** Replace the bug's team-label keys ([] clears them). */
  labelKeys?: string[];
  /** Replace the bug's custom-field values, keyed by field id. */
  customFields?: Record<string, CustomFieldValue>;
}

const invalidateKey = ['bugs'];

export function useBugs(query?: BugQuery) {
  return useQuery({
    queryKey: ['bugs', query ?? {}],
    queryFn: () => apiGet<ListResponse<BugDto>>('/bugs', { limit: 100, ...query }),
  });
}

export function useBug(id: string | undefined) {
  return useQuery({
    queryKey: ['bug', id],
    queryFn: () => apiGet<BugDto>(`/bugs/${id}`),
    enabled: !!id,
  });
}

export function useCreateBug() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBugInput) => apiPost<BugDto>('/bugs', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: invalidateKey }),
  });
}

export function useUpdateBug() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBugInput }) =>
      apiPatch<BugDto>(`/bugs/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invalidateKey });
      // Detail queries are keyed by the route ref (shortId *or* uuid), so
      // invalidate the whole 'bug' prefix — an edit made via the uuid must still
      // refetch a detail opened by shortId, or a new attachment wouldn't show
      // until reload.
      qc.invalidateQueries({ queryKey: ['bug'] });
    },
  });
}

/**
 * Optimistic: the card lands in its new column the instant it's dropped, rather
 * than sitting in the old one until the server answers. If the write fails the
 * snapshot is restored, so it springs back to where it came from.
 */
export function useSetBugStatus() {
  const qc = useQueryClient();
  return useMutation({
    // `status` is a column key — built-in or custom, so a string.
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPatch<BugDto>(`/bugs/${id}/status`, { status }),
    onMutate: async ({ id, status }) => {
      // Stop in-flight refetches from clobbering the optimistic state.
      await qc.cancelQueries({ queryKey: invalidateKey });
      await qc.cancelQueries({ queryKey: ['bug', id] });
      const lists = qc.getQueriesData<ListResponse<BugDto>>({ queryKey: invalidateKey });
      const detail = qc.getQueryData<BugDto>(['bug', id]);
      qc.setQueriesData<ListResponse<BugDto>>({ queryKey: invalidateKey }, (old) =>
        old ? { ...old, items: old.items.map((b) => (b.id === id ? { ...b, status } : b)) } : old,
      );
      qc.setQueryData<BugDto>(['bug', id], (old) => (old ? { ...old, status } : old));
      return { lists, detail };
    },
    onError: (err, { id }, ctx) => {
      ctx?.lists.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.detail) qc.setQueryData(['bug', id], ctx.detail);
      // Say why — an unexplained snap-back just reads as a broken board.
      toast.error(t('boards.moveFailed'), { description: err.message });
    },
    // Resync either way — the server owns updatedAt and any derived fields.
    onSettled: (_d, _e, { id }) => {
      qc.invalidateQueries({ queryKey: invalidateKey });
      qc.invalidateQueries({ queryKey: ['bug', id] });
    },
  });
}

export function useDeleteBug() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/bugs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: invalidateKey }),
  });
}
