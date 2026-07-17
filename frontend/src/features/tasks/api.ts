import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import type { ListResponse, TaskDto } from '@/types/dto';
import type { TaskStatus } from '@/types/enums';

export interface TaskQuery {
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
  status?: TaskStatus;
  roadmapId?: string;
  roadmapItemId?: string;
  roadmapItemLabel?: string;
  projectId?: string;
  assigneeId?: string;
  dueDate?: string;
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

export function useSetTaskStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      apiPatch<TaskDto>(`/tasks/${id}/status`, { status }),
    onSuccess: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/tasks/${id}`),
    onSuccess: invalidate,
  });
}
