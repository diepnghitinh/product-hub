import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import type { ListResponse, ProjectDto } from '@/types/dto';
import type { ProjectEnvironment } from '@/types/enums';

export interface ProjectQuery {
  page?: number;
  limit?: number;
  search?: string;
  environment?: ProjectEnvironment;
}

export interface CreateProjectInput {
  title: string;
  subtitle?: string;
  owner?: string;
  environment?: ProjectEnvironment;
}

export interface UpdateProjectInput {
  title?: string;
  subtitle?: string;
  owner?: string;
  environment?: ProjectEnvironment;
  pinned?: boolean;
}

const projectKeys = {
  all: ['projects'] as const,
  list: (params?: ProjectQuery) => ['projects', 'list', params ?? {}] as const,
  archived: (params?: ProjectQuery) =>
    ['projects', 'archived', params ?? {}] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
};

export function useProjects(params?: ProjectQuery) {
  return useQuery({
    queryKey: projectKeys.list(params),
    queryFn: () => apiGet<ListResponse<ProjectDto>>('/projects', params),
  });
}

export function useArchivedProjects(enabled = true, params?: ProjectQuery) {
  return useQuery({
    queryKey: projectKeys.archived(params),
    queryFn: () => apiGet<ListResponse<ProjectDto>>('/projects/archived', params),
    enabled,
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(id ?? ''),
    queryFn: () => apiGet<ProjectDto>(`/projects/${id}`),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      apiPost<ProjectDto>('/projects', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProjectInput }) =>
      apiPatch<ProjectDto>(`/projects/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useArchiveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<ProjectDto>(`/projects/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useSetProjectSharing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiPost<ProjectDto>(`/projects/${id}/share`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useRestoreProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<ProjectDto>(`/projects/${id}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/projects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}
