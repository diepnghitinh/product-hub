import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/lib/api';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import type { ReactionGroupDto } from '@/types/dto';
import { REACTION_EMOJIS, ReactionTargetType } from '@/types/enums';

const keyOf = (targetType: ReactionTargetType, targetId: string) => [
  'reactions',
  targetType,
  targetId,
];

/** Per-emoji tallies for one entity. Shared cache across any bar on the page. */
export function useReactions(targetType: ReactionTargetType, targetId: string | undefined) {
  return useQuery({
    queryKey: keyOf(targetType, targetId ?? ''),
    queryFn: () => apiGet<ReactionGroupDto[]>('/reactions', { targetType, targetId }),
    enabled: !!targetId,
  });
}

/** Keep groups in the fixed palette order, matching the server. */
function ordered(groups: ReactionGroupDto[]): ReactionGroupDto[] {
  const order = REACTION_EMOJIS as readonly string[];
  return [...groups].sort((a, b) => order.indexOf(a.emoji) - order.indexOf(b.emoji));
}

/** Flip the current user's reaction with `emoji` in a cached group list. */
function applyToggle(groups: ReactionGroupDto[], emoji: string, myName: string): ReactionGroupDto[] {
  const existing = groups.find((g) => g.emoji === emoji);
  let next: ReactionGroupDto[];
  if (!existing) {
    next = [...groups, { emoji, count: 1, reactedByMe: true, userNames: myName ? [myName] : [] }];
  } else if (existing.reactedByMe) {
    const count = existing.count - 1;
    next =
      count <= 0
        ? groups.filter((g) => g.emoji !== emoji)
        : groups.map((g) =>
            g.emoji === emoji
              ? { ...g, count, reactedByMe: false, userNames: removeOnce(g.userNames, myName) }
              : g,
          );
  } else {
    next = groups.map((g) =>
      g.emoji === emoji
        ? { ...g, count: g.count + 1, reactedByMe: true, userNames: [...g.userNames, myName].filter(Boolean) }
        : g,
    );
  }
  return ordered(next);
}

function removeOnce(names: string[], name: string): string[] {
  const i = names.indexOf(name);
  if (i < 0) return names;
  return [...names.slice(0, i), ...names.slice(i + 1)];
}

/**
 * Toggle the current user's reaction. Optimistic: the pill fills / the count
 * ticks instantly; the server's authoritative tally replaces it on success and a
 * failure rolls the cache back.
 */
export function useToggleReaction(targetType: ReactionTargetType, targetId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = keyOf(targetType, targetId);
  return useMutation({
    mutationFn: (emoji: string) =>
      apiPost<ReactionGroupDto[]>('/reactions/toggle', { targetType, targetId, emoji }),
    onMutate: async (emoji) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ReactionGroupDto[]>(key);
      qc.setQueryData<ReactionGroupDto[]>(key, (old) =>
        applyToggle(old ?? [], emoji, user?.name ?? ''),
      );
      return { prev };
    },
    onError: (err: Error, _emoji, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(t('reactions.failed'), { description: err.message });
    },
    onSuccess: (list) => qc.setQueryData(key, list),
  });
}
