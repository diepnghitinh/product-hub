import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import type { BugDto, ListResponse } from '@/types/dto';
import type { BugSeverity, BugStatus } from '@/types/enums';

export interface BugQuery {
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
  type?: string;
  projectId?: string;
  caseId?: string;
  caseLabel?: string;
  reportId?: string;
  assigneeId?: string;
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
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: invalidateKey });
      qc.invalidateQueries({ queryKey: ['bug', v.id] });
    },
  });
}

export function useSetBugStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: BugStatus }) =>
      apiPatch<BugDto>(`/bugs/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: invalidateKey }),
  });
}

export function useDeleteBug() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/bugs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: invalidateKey }),
  });
}
