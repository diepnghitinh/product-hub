import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import type { InboxResponseDto } from '@/types/dto';

export function useInbox() {
  return useQuery({
    queryKey: ['inbox'],
    queryFn: () => apiGet<InboxResponseDto>('/inbox'),
    // Poll so the topbar badge stays roughly fresh.
    refetchInterval: 60_000,
  });
}

/**
 * Mark a single notification read. Optimistic: that row's unread dot clears and
 * the badge ticks down at once, then the server confirms.
 */
export function useMarkInboxItemRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => apiPost<{ ok: true }>('/inbox/read', { key }),
    onMutate: async (key) => {
      await qc.cancelQueries({ queryKey: ['inbox'] });
      const prev = qc.getQueryData<InboxResponseDto>(['inbox']);
      qc.setQueryData<InboxResponseDto>(['inbox'], (old) => {
        if (!old) return old;
        let dec = 0;
        const items = old.items.map((it) => {
          if (it.key === key && !it.seen) {
            dec += 1;
            return { ...it, seen: true };
          }
          return it;
        });
        return { ...old, items, unseenCount: Math.max(0, old.unseenCount - dec) };
      });
      return { prev };
    },
    onError: (_err, _key, ctx) => {
      if (ctx?.prev) qc.setQueryData(['inbox'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  });
}

/** Mark every current notification read (the "Mark all read" action). */
export function useMarkInboxSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ ok: true }>('/inbox/seen'),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['inbox'] });
      const prev = qc.getQueryData<InboxResponseDto>(['inbox']);
      qc.setQueryData<InboxResponseDto>(['inbox'], (old) =>
        old
          ? { ...old, items: old.items.map((it) => ({ ...it, seen: true })), unseenCount: 0 }
          : old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['inbox'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  });
}
