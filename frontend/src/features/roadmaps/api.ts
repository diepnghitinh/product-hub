import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';
import { t } from '@/i18n';
import type { RoadmapColumn, RoadmapDto, RoadmapItem } from '@/types/dto';

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

/**
 * Optimistic: the board reflects the drop immediately — the card leaves its old
 * slot and lands in the new one rather than snapping back until the server
 * answers. `items` carries the order too, so this covers reorder as well as
 * moves. A failed write restores the previous array.
 */
export function useReplaceRoadmapItems() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: RoadmapItem[] }) =>
      apiPut<RoadmapDto>(`/roadmaps/${id}/items`, { items }),
    onMutate: async ({ id, items }) => {
      // Stop an in-flight refetch from clobbering the optimistic state.
      await qc.cancelQueries({ queryKey: ['roadmap', id] });
      const prev = qc.getQueryData<RoadmapDto>(['roadmap', id]);
      qc.setQueryData<RoadmapDto>(['roadmap', id], (old) => (old ? { ...old, items } : old));
      return { prev };
    },
    onError: (err, { id }, ctx) => {
      if (ctx?.prev) qc.setQueryData(['roadmap', id], ctx.prev);
      // Say why — an unexplained snap-back just reads as a broken board.
      toast.error(t('boards.moveFailed'), { description: err.message });
    },
    // Resync either way — the server recomputes riceScore/itemCount.
    onSettled: invalidate,
  });
}

export function useReplaceRoadmapColumns() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, columns }: { id: string; columns: RoadmapColumn[] }) =>
      apiPut<RoadmapDto>(`/roadmaps/${id}/columns`, { columns }),
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

/** Toggle a roadmap's public read-only link (mints/keeps the token server-side). */
export function useSetRoadmapSharing() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiPost<RoadmapDto>(`/roadmaps/${id}/share`, { enabled }),
    onSuccess: invalidate,
  });
}
