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

/**
 * Fields the *server* decides, so an optimistic guess would be wrong rather than
 * merely early: `assigneeIds`/`assigneeId` are resolved into `assignees` (with
 * each person's denormalised name), and `branchName` decides the derived
 * `branch`. Those two wait for the answer; everything else in a patch is stored
 * verbatim, so the cache can hold it straight away.
 */
const SERVER_RESOLVED = new Set(['assigneeIds', 'assigneeId', 'branchName']);

/**
 * The part of a patch that can safely land in the cache before the server replies.
 * Drops the {@link SERVER_RESOLVED} fields and any `undefined`, and mirrors
 * `endDate` onto the legacy `dueDate` — the server keeps those two in sync, and a
 * reader that falls back to `dueDate` would otherwise show the old date until the
 * refetch.
 */
function optimisticPatch(input: object): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || SERVER_RESOLVED.has(key)) continue;
    patch[key] = value;
  }
  if ('endDate' in patch && !('dueDate' in patch)) patch.dueDate = patch.endDate;
  return patch;
}

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

  /** Refresh both the lists and any open detail — `[detailKey, id]` doesn't
   * prefix-match `[listKey]`, so the detail prefix needs invalidating separately. */
  function useInvalidate() {
    const qc = useQueryClient();
    return () => {
      qc.invalidateQueries({ queryKey: [listKey] });
      qc.invalidateQueries({ queryKey: [detailKey] });
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

  /**
   * Optimistic, for the same reason the status move is: a Properties control is
   * bound to what the cache holds, so without this an estimate (or a date, or a
   * label) keeps showing its **old** value for the whole round-trip *plus* the
   * refetch that follows — which reads as "the field didn't take".
   *
   * Only the fields the server stores verbatim are guessed at (see
   * {@link optimisticPatch}); a failed write rolls the snapshot back and says so,
   * since a value that silently reverts is worse than one that never moved.
   */
  function useUpdate() {
    const qc = useQueryClient();
    const invalidate = useInvalidate();
    return useMutation({
      mutationFn: ({ id, input }: { id: string; input: TUpdate }) =>
        apiPatch<TItem>(`/issues/${id}`, input),
      onMutate: async ({ id, input }) => {
        const patch = optimisticPatch(input);
        if (!Object.keys(patch).length) return undefined;
        // Stop in-flight refetches from clobbering the optimistic state.
        await qc.cancelQueries({ queryKey: [listKey] });
        await qc.cancelQueries({ queryKey: [detailKey] });
        const lists = qc.getQueriesData<ListResponse<TItem>>({ queryKey: [listKey] });
        const details = qc.getQueriesData<TItem>({ queryKey: [detailKey] });
        qc.setQueriesData<ListResponse<TItem>>({ queryKey: [listKey] }, (old) =>
          old && old.items.some((it) => it.id === id)
            ? { ...old, items: old.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }
            : old,
        );
        // A detail is cached under whatever the URL carried — a ref (`TSK-6HCUHKX`)
        // as often as the uuid — so match the *item*, never the key.
        qc.setQueriesData<TItem>({ queryKey: [detailKey] }, (old) =>
          old && old.id === id ? { ...old, ...patch } : old,
        );
        return { lists, details };
      },
      onError: (err, _vars, ctx) => {
        ctx?.lists.forEach(([key, data]) => qc.setQueryData(key, data));
        ctx?.details.forEach(([key, data]) => qc.setQueryData(key, data));
        toast.error(t('boards.saveFailed'), { description: err.message });
      },
      // Resync either way — the server owns updatedAt and any derived fields.
      onSettled: invalidate,
    });
  }

  /**
   * Optimistic: the card lands in its new column — and at the exact slot it was
   * dropped on — the instant it's released, rather than sitting where it was
   * until the server answers. If the write fails the snapshot is restored, so it
   * springs back to where it came from.
   *
   * `beforeId` is the card it was dropped onto; it ends up directly above that
   * one. Omitted means the end of the column. The board renders the list in
   * array order, so moving the item within `items` *is* the reorder — and it
   * matches what the server will send back, which sorts by the same `order`.
   */
  function useSetStatus() {
    const qc = useQueryClient();
    const invalidate = useInvalidate();
    return useMutation({
      // `status` is a column key — built-in or custom, so a string.
      mutationFn: ({ id, status, beforeId }: { id: string; status: string; beforeId?: string | null }) =>
        apiPatch<TItem>(`/issues/${id}/status`, { status, ...(beforeId ? { beforeId } : {}) }),
      onMutate: async ({ id, status, beforeId }) => {
        // Stop in-flight refetches from clobbering the optimistic state.
        await qc.cancelQueries({ queryKey: [listKey] });
        await qc.cancelQueries({ queryKey: [detailKey] });
        const lists = qc.getQueriesData<ListResponse<TItem>>({ queryKey: [listKey] });
        const details = qc.getQueriesData<TItem>({ queryKey: [detailKey] });
        qc.setQueriesData<ListResponse<TItem>>({ queryKey: [listKey] }, (old) => {
          if (!old) return old;
          const moved = old.items.find((it) => it.id === id);
          if (!moved) return old;
          const rest = old.items.filter((it) => it.id !== id);
          // A `beforeId` that isn't in *this* cached list (a differently filtered
          // board) falls back to the end — the same rule the server applies.
          const at = beforeId ? rest.findIndex((it) => it.id === beforeId) : -1;
          rest.splice(at < 0 ? rest.length : at, 0, { ...moved, status } as TItem);
          return { ...old, items: rest };
        });
        // Match the *item*, not the key: a detail opened from `/issues/TSK-6HCUHKX`
        // is cached under that ref, so `[detailKey, uuid]` would find nothing.
        qc.setQueriesData<TItem>({ queryKey: [detailKey] }, (old) =>
          old && old.id === id ? ({ ...old, status } as TItem) : old,
        );
        return { lists, details };
      },
      onError: (err, _vars, ctx) => {
        ctx?.lists.forEach(([key, data]) => qc.setQueryData(key, data));
        ctx?.details.forEach(([key, data]) => qc.setQueryData(key, data));
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
