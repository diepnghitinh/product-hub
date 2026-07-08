import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import type { GroupDto } from '@/types/dto';

const groupKeys = {
  byProject: (projectId: string) => ['groups', projectId] as const,
};

export function useGroups(projectId: string | undefined) {
  return useQuery({
    queryKey: groupKeys.byProject(projectId ?? ''),
    queryFn: () => apiGet<GroupDto[]>(`/projects/${projectId}/groups`),
    enabled: !!projectId,
  });
}

export function useCreateGroup(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) =>
      apiPost<GroupDto>(`/projects/${projectId}/groups`, { title }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: groupKeys.byProject(projectId) }),
  });
}

export function useUpdateGroup(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiPatch<GroupDto>(`/projects/${projectId}/groups/${id}`, { title }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: groupKeys.byProject(projectId) }),
  });
}

export function useReorderGroups(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiPost<GroupDto[]>(`/projects/${projectId}/groups/reorder`, { ids }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: groupKeys.byProject(projectId) }),
  });
}

export function useDeleteGroup(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ ok: true }>(`/projects/${projectId}/groups/${id}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: groupKeys.byProject(projectId) }),
  });
}
