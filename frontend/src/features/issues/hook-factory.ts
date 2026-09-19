import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { t } from '@/i18n';
import type { ListResponse } from '@/types/dto';
import type { IssueKind } from '@/types/enums';

/**
 * The one implementation behind `useIssues`, `useTasks` and `useBugs`. Every issue
 * board is the same collection reached through the same `/issues` endpoint — the only
 * real differences are (a) which cache namespace it lives under and (b) whether it's
 * scoped to a single `kind`. This factory captures the shared fetch + optimistic
 * status logic once; each feature binds it to its own keys, `kind` and DTO type so
 * callers keep the exact hook names, params, return types and cache keys they had.
 *
 * Keeping the three cache namespaces separate (`tasks` / `bugs` / `issues`) is
 * deliberate: each board still invalidates only its own list, exactly as before — so
 * sharing the code changes nothing about caching behaviour.
 */
export interface IssueHookConfig {
  /** Cache-key prefix for lists, e.g. `'tasks'` → `['tasks', query]`. */
  listKey: string;
  /** Cache-key prefix for a single item, e.g. `'task'` → `['task', id]`. */
  detailKey: string;
  /** Scopes list + create to one kind; omit to span both (the unified `useIssues`). */
  kind?: IssueKind;
}

/** The minimum an item needs for the optimistic status swap — every issue DTO has both. */
interface HasStatus {
  id: string;
  status: string;
}

/** Every cache namespace this factory is bound to, list and detail. They are all
 *  views of the single `issues` collection, so a write through any one of them
 *  can go stale in the others — see {@link makeIssueHooks}'s `useInvalidate`.
 *
 *  `roadmap`/`roadmaps` are not views of an issue, but they *contain* one: a
 *  backlog item's percent complete is derived server-side from the issues linked
 *  to it, so moving a sub-task to Done changes what a roadmap read returns.
 *  Without them the panel's "1 of 2 done" bar updated on the spot while the
 *  Progress % beside it kept the number from the last fetch. */
const ISSUE_CACHE_KEYS = [
  'issues',
  'issue',
  'bugs',
  'bug',
  'tasks',
  'task',
  'activity',
  'roadmap',
  'roadmaps',
] as const;

export function makeIssueHooks<
  TItem extends HasStatus,
  TQuery,
  TCreate extends object,
  TUpdate extends object,
>({
  listKey,
  detailKey,
  kind,
}: IssueHookConfig) {
  // Injected into list filters + create bodies to scope one kind; `{}` spans both.
  const kindParam = kind ? { kind } : {};

  /**
   * Refresh **every** namespace, not just this binding's.
   *
   * There are three caches over the *one* `issues` collection — `issues`/`issue`,
   * `bugs`/`bug`, `tasks`/`task` — and one `PATCH /issues/:id` can change what
   * any of them holds: the same bug is a row on `/issues`, the card on `/bugs`,
   * and the record behind its own page. Invalidating only the namespace the write
   * happened to be issued through is why a field written from a bug's Properties
   * (which mutates through `useUpdateIssue`, i.e. `issues`) saved server-side and
   * then snapped back — `useBug` reads `['bug', id]` and was never told.
   *
   * Cost is small: React Query refetches only *mounted* queries and merely marks
   * the rest stale. A fourth binding of this factory must be added here too.
   * (`[detailKey, id]` doesn't prefix-match `[listKey]`, so both are listed.)
   */
  function useInvalidate() {
    const qc = useQueryClient();
    return () => {
      for (const key of ISSUE_CACHE_KEYS) qc.invalidateQueries({ queryKey: [key] });
    };
  }

  function useList(query?: TQuery) {
    return useQuery({
      queryKey: [listKey, query ?? {}],
      // 100 is the backend's PaginationDto cap — anything higher fails validation.
      queryFn: () => apiGet<ListResponse<TItem>>('/issues', { limit: 100, ...kindParam, ...query }),
    });
  }

  function useDetail(id: string | undefined) {
    return useQuery({
      queryKey: [detailKey, id],
      queryFn: () => apiGet<TItem>(`/issues/${id}`),
      enabled: !!id,
    });
  }

  function useCreate() {
    const invalidate = useInvalidate();
    return useMutation({
      mutationFn: (input: TCreate) => apiPost<TItem>('/issues', { ...kindParam, ...input }),
      onSuccess: invalidate,
    });
  }

  function useUpdate() {
    const invalidate = useInvalidate();
    return useMutation({
      mutationFn: ({ id, input }: { id: string; input: TUpdate }) =>
        apiPatch<TItem>(`/issues/${id}`, input),
      onSuccess: invalidate,
    });
  }

  /**
   * Optimistic: the card lands in its new column the instant it's dropped, rather
   * than sitting in the old one until the server answers. If the write fails the
   * snapshot is restored, so it springs back to where it came from.
   */
  function useSetStatus() {
    const qc = useQueryClient();
    const invalidate = useInvalidate();
    return useMutation({
      // `status` is a column key — built-in or custom, so a string.
      mutationFn: ({ id, status }: { id: string; status: string }) =>
        apiPatch<TItem>(`/issues/${id}/status`, { status }),
      onMutate: async ({ id, status }) => {
        // Stop in-flight refetches from clobbering the optimistic state.
        await qc.cancelQueries({ queryKey: [listKey] });
        await qc.cancelQueries({ queryKey: [detailKey, id] });
        const lists = qc.getQueriesData<ListResponse<TItem>>({ queryKey: [listKey] });
        const detail = qc.getQueryData<TItem>([detailKey, id]);
        qc.setQueriesData<ListResponse<TItem>>({ queryKey: [listKey] }, (old) =>
          old
            ? {
                ...old,
                items: old.items.map((it) => (it.id === id ? ({ ...it, status } as TItem) : it)),
              }
            : old,
        );
        qc.setQueryData<TItem>([detailKey, id], (old) => (old ? ({ ...old, status } as TItem) : old));
        return { lists, detail };
      },
      onError: (err, { id }, ctx) => {
        ctx?.lists.forEach(([key, data]) => qc.setQueryData(key, data));
        if (ctx?.detail) qc.setQueryData([detailKey, id], ctx.detail);
        // Say why — an unexplained snap-back just reads as a broken board.
        toast.error(t('boards.moveFailed'), { description: err.message });
      },
      // Resync either way — the server owns updatedAt and any derived fields.
      onSettled: invalidate,
    });
  }

  function useRemove() {
    const invalidate = useInvalidate();
    return useMutation({
      mutationFn: (id: string) => apiDelete<{ ok: true }>(`/issues/${id}`),
      onSuccess: invalidate,
    });
  }

  return { useInvalidate, useList, useDetail, useCreate, useUpdate, useSetStatus, useRemove };
}
