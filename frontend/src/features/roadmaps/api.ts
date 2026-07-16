import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';
import type { RoadmapDto, RoadmapItem } from '@/types/dto';

export function useRoadmaps() {
  return useQuery({ queryKey: ['roadmaps'], queryFn: () => apiGet<RoadmapDto[]>('/roadmaps') });
}

export function useRoadmap(id: string | undefined) {
  return useQuery({
    queryKey: ['roadmap', id],
    queryFn: () => apiGet<RoadmapDto>(`/roadmaps/${id}`),
    enabled: !!id,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['roadmaps'] });
    qc.invalidateQueries({ queryKey: ['roadmap'] });
  };
}

export function useCreateRoadmap() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { title: string; description?: string; projectId?: string }) =>
      apiPost<RoadmapDto>('/roadmaps', input),
    onSuccess: invalidate,
  });
}

export function useUpdateRoadmap() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { title?: string; description?: string } }) =>
      apiPatch<RoadmapDto>(`/roadmaps/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useReplaceRoadmapItems() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: RoadmapItem[] }) =>
      apiPut<RoadmapDto>(`/roadmaps/${id}/items`, { items }),
    onSuccess: invalidate,
  });
}

export function useDeleteRoadmap() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/roadmaps/${id}`),
    onSuccess: invalidate,
  });
}
