import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { t } from '@/i18n';
import type { ListResponse, TaskDto } from '@/types/dto';
import type { TaskStatus } from '@/types/enums';

export interface TaskQuery {
  /** Scope to a team's issue list. */
  teamId?: string;
  /** Multi-value — serialized as repeated keys (`?status=a&status=b`). */
  status?: TaskStatus[];
  assigneeId?: string[];
  /** Tasks assigned to OR created by this user id (the "My Tasks" filter). */
  mine?: string;
  roadmapItemId?: string | string[];
  roadmapId?: string[];
  projectId?: string[];
  search?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  /** Built-in `TaskStatus` or a team's custom column key. Defaults to the first column. */
  status?: TaskStatus | string;
  roadmapId?: string;
  roadmapItemId?: string;
  roadmapItemLabel?: string;
  projectId?: string;
  assigneeId?: string;
  dueDate?: string;
  /**
   * The team whose list to create in. Must be sent from a team's board —
   * without it the API files the task under the workspace's default task team,
   * not the one you were looking at.
   */
  teamId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  roadmapId?: string;
  roadmapItemId?: string;
  roadmapItemLabel?: string;
  projectId?: string;
  dueDate?: string;
  assigneeId?: string;
}

/** Refresh both the lists and any open task detail — `['task', id]` doesn't
 * prefix-match `['tasks']`, so it needs invalidating separately. */
function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['task'] });
  };
}

/** List tasks — filter by backlog item, assignee, status, project. */
export function useTasks(query?: TaskQuery) {
  return useQuery({
    queryKey: ['tasks', query ?? {}],
    // 100 is the backend's PaginationDto cap — anything higher fails validation.
    queryFn: () => apiGet<ListResponse<TaskDto>>('/tasks', { limit: 100, ...query }),
  });
}

/** A single task — drives the task detail page. */
export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: () => apiGet<TaskDto>(`/tasks/${id}`),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => apiPost<TaskDto>('/tasks', input),
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      apiPatch<TaskDto>(`/tasks/${id}`, input),
    onSuccess: invalidate,
  });
}

/**
 * Optimistic: the card lands in its new column the instant it's dropped, rather
 * than sitting in the old one until the server answers. If the write fails the
 * snapshot is restored, so it springs back to where it came from.
 */
export function useSetTaskStatus() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    // `status` is a column key — built-in or custom, so a string.
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPatch<TaskDto>(`/tasks/${id}/status`, { status }),
    onMutate: async ({ id, status }) => {
      // Stop in-flight refetches from clobbering the optimistic state.
      await qc.cancelQueries({ queryKey: ['tasks'] });
      await qc.cancelQueries({ queryKey: ['task', id] });
      const lists = qc.getQueriesData<ListResponse<TaskDto>>({ queryKey: ['tasks'] });
      const detail = qc.getQueryData<TaskDto>(['task', id]);
      qc.setQueriesData<ListResponse<TaskDto>>({ queryKey: ['tasks'] }, (old) =>
        old
          ? { ...old, items: old.items.map((tk) => (tk.id === id ? { ...tk, status } : tk)) }
          : old,
      );
      qc.setQueryData<TaskDto>(['task', id], (old) => (old ? { ...old, status } : old));
      return { lists, detail };
    },
    onError: (err, { id }, ctx) => {
      ctx?.lists.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.detail) qc.setQueryData(['task', id], ctx.detail);
      // Say why — an unexplained snap-back just reads as a broken board.
      toast.error(t('boards.moveFailed'), { description: err.message });
    },
    // Resync either way — the server owns updatedAt and any derived fields.
    onSettled: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/tasks/${id}`),
    onSuccess: invalidate,
  });
}
