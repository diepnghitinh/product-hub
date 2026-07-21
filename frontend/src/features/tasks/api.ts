import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { t } from '@/i18n';
import type { ListResponse, TaskDto } from '@/types/dto';
import type { CustomFieldValue, TaskStatus } from '@/types/enums';

export interface TaskQuery {
  /** Scope to a team's issue list. */
  teamId?: string;
  /** Multi-value — serialized as repeated keys (`?status=a&status=b`). */
  status?: TaskStatus[];
  assigneeId?: string[];
  /** Tasks assigned to OR created by this user id (the "My Tasks" filter). */
  mine?: string;
  /** A task's sub-tasks — filter to children of this parent task id. */
  parentId?: string | string[];
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
  /** Set to create this task as a sub-task of the given parent. */
  parentId?: string;
  roadmapId?: string;
  roadmapItemId?: string;
  roadmapItemLabel?: string;
  projectId?: string;
  assigneeId?: string;
  dueDate?: string;
  /** Points on the estimate scale (see `TASK_ESTIMATES`); `0`/omitted = unset. */
  estimate?: number;
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
  /** Set/clear the parent task (empty string detaches this sub-task). */
  parentId?: string;
  roadmapId?: string;
  roadmapItemId?: string;
  roadmapItemLabel?: string;
  projectId?: string;
  dueDate?: string;
  estimate?: number;
  assigneeId?: string;
  /** Replace the task's team-label keys ([] clears them). */
  labelKeys?: string[];
  /** Replace the task's custom-field values, keyed by field id. */
  customFields?: Record<string, CustomFieldValue>;
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
 * Pull task refs out of free text (a roadmap item's description), matching a
 * task link `/tasks/TSK-5` — bare, or inside a full URL/anchor. Returns the
 * unique shortId refs, upper-cased. The prefix is any `<CODE>-<number>`, so it
 * catches `TSK-`/`BUG-` and team-derived codes like `ENG-` alike.
 */
export function taskRefsInText(text: string): string[] {
  const refs = new Set<string>();
  const re = /\/tasks\/([A-Za-z]{2,}-\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) refs.add(m[1].toUpperCase());
  return [...refs];
}

/**
 * Resolve `/tasks/…` refs found in an item's description and link each to that
 * item — the same write `PickTaskDialog` does. A ref that doesn't resolve (a
 * typo, or a task from another workspace) is skipped silently; a task already on
 * this item is left alone. Resolves via `GET /tasks/<ref>` (the API's `findByRef`
 * accepts a shortId). Returns the shortIds actually linked.
 */
export function useLinkTasksByRef() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (args: {
      refs: string[];
      roadmapId: string;
      roadmapItemId: string;
      roadmapItemLabel: string;
      projectId?: string;
    }) => {
      const linked: string[] = [];
      for (const ref of args.refs) {
        try {
          const task = await apiGet<TaskDto>(`/tasks/${ref}`);
          if (!task || task.roadmapItemId === args.roadmapItemId) continue;
          await apiPatch<TaskDto>(`/tasks/${task.id}`, {
            roadmapId: args.roadmapId,
            roadmapItemId: args.roadmapItemId,
            roadmapItemLabel: args.roadmapItemLabel,
            projectId: args.projectId,
          });
          linked.push(task.shortId || task.id);
        } catch {
          // Unresolved or foreign ref — ignore, per the add-only behaviour.
        }
      }
      return linked;
    },
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
