import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPut } from '@/lib/api';
import { IssueKind } from '@/types/enums';
import { makeIssueHooks } from '@/features/issues/hook-factory';
import type { TaskDto } from '@/types/dto';
import type { CustomFieldValue, TaskStatus, TeamStatusConfig } from '@/types/enums';

/**
 * Tasks read/write the unified **`/issues`** collection (with `kind: task`), not the
 * retired `/tasks` endpoint — `/issues` is authoritative. The fetch + optimistic
 * cache logic lives once in `makeIssueHooks`; this file only binds it to the task
 * cache namespace (`['tasks']`/`['task']`), `kind: task`, and `TaskDto`, so the hook
 * names, params, return types and cache keys every caller already uses are unchanged.
 * (Personal-board *columns* at the bottom stay on `/users/me/personal-statuses` —
 * they were never a task endpoint.)
 */

export interface TaskQuery {
  /** Scope to a team's issue list. */
  teamId?: string;
  /** Multi-value — serialized as repeated keys (`?status=a&status=b`). */
  status?: TaskStatus[];
  assigneeId?: string[];
  /** Tasks assigned to this user id (the "Assigned to me" / personal views). */
  mine?: string;
  /**
   * The caller's *private personal board* — returns only their own personal
   * tasks (owner taken from the token, never a param). Every other list omits
   * this, so personal tasks never surface in team/assigned views.
   */
  personal?: boolean;
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
  /** Start of the work window, ISO `YYYY-MM-DD`. */
  startDate?: string;
  /** End / target date, ISO `YYYY-MM-DD` (the deadline). */
  endDate?: string;
  /** @deprecated Legacy alias of `endDate`; prefer `endDate`. */
  dueDate?: string;
  /** Points on the estimate scale (see `TASK_ESTIMATES`); `0`/omitted = unset. */
  estimate?: number;
  /**
   * The team whose list to create in. Must be sent from a team's board —
   * without it the API files the task under the workspace's default task team,
   * not the one you were looking at.
   */
  teamId?: string;
  /**
   * Create this as a *private personal* task on the caller's Personal board
   * (owned by them, in no team). The owner comes from the token; `status` is a
   * personal-board column key.
   */
  personal?: boolean;
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
  startDate?: string;
  endDate?: string;
  /** @deprecated Legacy alias of `endDate`; prefer `endDate`. */
  dueDate?: string;
  estimate?: number;
  assigneeId?: string;
  /** Replace the task's team-label keys ([] clears them). */
  labelKeys?: string[];
  /** Replace the task's custom-field values, keyed by field id. */
  customFields?: Record<string, CustomFieldValue>;
}

// Bound to the task cache namespace (`['tasks']`/`['task']`) + `kind: task`; all the
// fetch/optimistic logic lives in `makeIssueHooks` (see issues/hook-factory.ts).
const hooks = makeIssueHooks<TaskDto, TaskQuery, CreateTaskInput, UpdateTaskInput>({
  listKey: 'tasks',
  detailKey: 'task',
  kind: IssueKind.TASK,
});

/** List tasks — filter by backlog item, assignee, status, project. */
export const useTasks = hooks.useList;
/** A single task — drives the task detail page. */
export const useTask = hooks.useDetail;
export const useCreateTask = hooks.useCreate;
export const useUpdateTask = hooks.useUpdate;

/**
 * Pull task refs out of free text (a roadmap item's description), matching a
 * task link `/tasks/TSK-5` — bare, or inside a full URL/anchor. Returns the
 * unique shortId refs, upper-cased. A ref is `<CODE>-<id>`: the id is a random
 * suffix (`TSK-6HCUHKX`) or, for older rows, digits (`TSK-5`), so it catches
 * `TSK-`/`BUG-` and team-derived codes like `ENG-` alike.
 */
export function taskRefsInText(text: string): string[] {
  const refs = new Set<string>();
  const re = /\/tasks\/([A-Za-z]{2,}-[A-Za-z0-9]+)/g;
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
  const invalidate = hooks.useInvalidate();
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
          const task = await apiGet<TaskDto>(`/issues/${ref}`);
          if (!task || task.roadmapItemId === args.roadmapItemId) continue;
          await apiPatch<TaskDto>(`/issues/${task.id}`, {
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

/** Optimistic status move — the card jumps columns on drop, snaps back on failure
 * (see `makeIssueHooks`). */
export const useSetTaskStatus = hooks.useSetStatus;
export const useDeleteTask = hooks.useRemove;

/**
 * The columns of the caller's *private personal board*. Per-user (owned via the
 * token) and shaped exactly like a team's statuses (`{ key, label, color }`), so
 * the same `KanbanBoard`/`TeamStatusConfig` plumbing renders them. Seeded from
 * the task defaults for every account.
 */
export function usePersonalStatuses() {
  return useQuery({
    queryKey: ['personal-statuses'],
    queryFn: () => apiGet<TeamStatusConfig[]>('/users/me/personal-statuses'),
  });
}

/** Replace the caller's personal-board columns (add / rename / recolour / reorder / remove). */
export function useReplacePersonalStatuses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (statuses: TeamStatusConfig[]) =>
      apiPut<TeamStatusConfig[]>('/users/me/personal-statuses', { personalStatuses: statuses }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['personal-statuses'] }),
  });
}
