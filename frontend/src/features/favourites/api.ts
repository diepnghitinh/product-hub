import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { t } from '@/i18n';
import type { FavouriteDto } from '@/types/dto';
import { FavouriteKind } from '@/types/enums';

const KEY = ['favourites'];

/** The current user's pinned entities (newest first). Shared cache — the sidebar
 * and every favourite button read the same query. */
export function useFavourites() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiGet<FavouriteDto[]>('/favourites'),
  });
}

/** Is this entity currently pinned? Kept here so the button and sidebar agree. */
export function isFavourited(
  list: FavouriteDto[] | undefined,
  kind: FavouriteKind,
  refId: string,
): boolean {
  return !!list?.some((f) => f.kind === kind && f.refId === refId);
}

interface AddVars {
  kind: FavouriteKind;
  refId: string;
  /** Required for roadmap items (which board the item lives in). */
  roadmapId?: string;
  /** Optimistic-only: shown until the server echoes the real title. Not sent. */
  title?: string;
}

/**
 * Pin an entity. Optimistic: the star fills and the sidebar row appears at once;
 * the server's authoritative list (with the real title) replaces it on success,
 * and a failure rolls the cache back.
 */
export function useAddFavourite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, refId, roadmapId }: AddVars) =>
      apiPost<FavouriteDto[]>('/favourites', { kind, refId, roadmapId }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<FavouriteDto[]>(KEY);
      qc.setQueryData<FavouriteDto[]>(KEY, (old) => {
        const list = old ?? [];
        if (isFavourited(list, vars.kind, vars.refId)) return list;
        const optimistic: FavouriteDto = {
          kind: vars.kind,
          refId: vars.refId,
          title: vars.title ?? '…',
          roadmapId: vars.roadmapId,
          createdAt: new Date().toISOString(),
        };
        return [optimistic, ...list];
      });
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
      toast.error(t('fav.actionFailed'), { description: err.message });
    },
    onSuccess: (list) => qc.setQueryData(KEY, list),
  });
}

/** Unpin an entity. Optimistic, with rollback on failure. */
export function useRemoveFavourite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, refId }: { kind: FavouriteKind; refId: string }) =>
      apiDelete<FavouriteDto[]>(`/favourites/${kind}/${encodeURIComponent(refId)}`),
    onMutate: async ({ kind, refId }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<FavouriteDto[]>(KEY);
      qc.setQueryData<FavouriteDto[]>(KEY, (old) =>
        (old ?? []).filter((f) => !(f.kind === kind && f.refId === refId)),
      );
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
      toast.error(t('fav.actionFailed'), { description: err.message });
    },
    onSuccess: (list) => qc.setQueryData(KEY, list),
  });
}

/**
 * One hook for a favourite toggle button: whether it's pinned, a `toggle()` that
 * adds or removes, and a pending flag. `title` seeds the optimistic sidebar row.
 */
export function useFavouriteToggle(
  kind: FavouriteKind,
  refId: string,
  opts?: { roadmapId?: string; title?: string },
) {
  const { data } = useFavourites();
  const add = useAddFavourite();
  const remove = useRemoveFavourite();
  const active = isFavourited(data, kind, refId);
  const toggle = () => {
    if (active) remove.mutate({ kind, refId });
    else add.mutate({ kind, refId, roadmapId: opts?.roadmapId, title: opts?.title });
  };
  return { active, toggle, isPending: add.isPending || remove.isPending };
}
