import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import type { ListResponse, TaskDto } from '@/types/dto';
import type { TaskStatus } from '@/types/enums';

export interface TaskQuery {
  status?: TaskStatus;
  assigneeId?: string;
  /** Tasks assigned to OR created by this user id (the "My Tasks" filter). */
  mine?: string;
  roadmapItemId?: string;
  roadmapId?: string;
  projectId?: string;
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

const invalidateKey = ['tasks'];

/** List tasks — filter by backlog item, assignee, status, project. */
export function useTasks(query?: TaskQuery) {
  return useQuery({
    queryKey: ['tasks', query ?? {}],
    queryFn: () => apiGet<ListResponse<TaskDto>>('/tasks', { limit: 200, ...query }),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => apiPost<TaskDto>('/tasks', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: invalidateKey }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      apiPatch<TaskDto>(`/tasks/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: invalidateKey }),
  });
}

export function useSetTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      apiPatch<TaskDto>(`/tasks/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: invalidateKey }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: invalidateKey }),
  });
}
