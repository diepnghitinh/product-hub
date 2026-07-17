import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';
import type { MilestoneDto, Objective } from '@/types/dto';
import type { MilestoneStatus } from '@/types/enums';

export function useMilestones() {
  return useQuery({
    queryKey: ['milestones'],
    queryFn: () => apiGet<MilestoneDto[]>('/milestones'),
  });
}

export function useMilestone(id: string | undefined) {
  return useQuery({
    queryKey: ['milestone', id],
    queryFn: () => apiGet<MilestoneDto>(`/milestones/${id}`),
    enabled: !!id,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['milestones'] });
    qc.invalidateQueries({ queryKey: ['milestone'] });
  };
}

export function useCreateMilestone() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { title: string; timeframe?: string }) =>
      apiPost<MilestoneDto>('/milestones', input),
    onSuccess: invalidate,
  });
}

export function useUpdateMilestone() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { title?: string; timeframe?: string; status?: MilestoneStatus };
    }) => apiPatch<MilestoneDto>(`/milestones/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useReplaceObjectives() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, objectives }: { id: string; objectives: Objective[] }) =>
      apiPut<MilestoneDto>(`/milestones/${id}/objectives`, { objectives }),
    // Painted straight away: every edit on the detail page is a whole-tree PUT,
    // and waiting for the round trip made dragging a weight feel like it had
    // snapped back. The server still has the last word — it re-splits the
    // weights and recomputes progress, which `invalidate` then pulls in.
    onMutate: async ({ id, objectives }) => {
      await qc.cancelQueries({ queryKey: ['milestone', id] });
      const previous = qc.getQueryData<MilestoneDto>(['milestone', id]);
      if (previous) qc.setQueryData<MilestoneDto>(['milestone', id], { ...previous, objectives });
      return { previous };
    },
    onError: (_err, { id }, context) => {
      if (context?.previous) qc.setQueryData(['milestone', id], context.previous);
    },
    onSettled: invalidate,
  });
}

export function useDeleteMilestone() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/milestones/${id}`),
    onSuccess: invalidate,
  });
}
