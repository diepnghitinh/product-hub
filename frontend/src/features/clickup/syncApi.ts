import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPut } from '@/lib/api';
import type {
  ClickUpListDto,
  ClickUpListStatusDto,
  ClickUpSpaceDto,
  ClickUpStatusPairDto,
  ClickUpSyncDto,
} from '@/types/dto';
import type { ClickUpSyncScope } from '@/types/enums';

/**
 * Binding a board to a ClickUp list.
 *
 * Separate from `api.ts` next door because the two answer different questions
 * for different people: that one is "what ClickUp task is on this issue?", asked
 * by anyone working an issue. This one is "where does this whole board sync?",
 * asked by an admin in settings — and every endpoint here is admin-only.
 */

const syncKey = (scope: ClickUpSyncScope, scopeId: string) => ['clickup', 'sync', scope, scopeId];

/**
 * One board's binding.
 *
 * `enabled` gates the request rather than the result: the editor is rendered
 * inside a collapsed settings section, and a workspace with no ClickUp shouldn't
 * pay a round trip per team just to render a section nobody opened.
 */
export function useClickUpSync(
  scope: ClickUpSyncScope,
  scopeId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: syncKey(scope, scopeId ?? ''),
    queryFn: () =>
      apiGet<ClickUpSyncDto>(`/clickup/sync/${scope}/${encodeURIComponent(scopeId ?? '')}`),
    enabled: enabled && !!scopeId,
  });
}

/** The spaces in the connected workspace. Cached — spaces change roughly never. */
export function useClickUpSpaces(enabled = true) {
  return useQuery({
    queryKey: ['clickup', 'spaces'],
    queryFn: () => apiGet<ClickUpSpaceDto[]>('/clickup/sync/spaces'),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Every list in one space, flattened across its folders. */
export function useClickUpLists(spaceId: string | undefined) {
  return useQuery({
    queryKey: ['clickup', 'lists', spaceId ?? ''],
    queryFn: () =>
      apiGet<ClickUpListDto[]>(`/clickup/sync/lists?spaceId=${encodeURIComponent(spaceId ?? '')}`),
    enabled: !!spaceId,
    staleTime: 5 * 60_000,
  });
}

/**
 * A list's statuses plus a suggested mapping onto this board.
 *
 * Fetched when a list is picked and *before* anything is saved, which is why it
 * takes the board as well as the list: the suggestion is the whole point, and it
 * can only be made against the columns it's mapping onto.
 */
export function useClickUpListStatuses(
  scope: ClickUpSyncScope,
  scopeId: string | undefined,
  listId: string | undefined,
) {
  return useQuery({
    queryKey: ['clickup', 'list-statuses', scope, scopeId ?? '', listId ?? ''],
    queryFn: () =>
      apiGet<{ statuses: ClickUpListStatusDto[]; suggested: ClickUpStatusPairDto[] }>(
        `/clickup/sync/${scope}/${encodeURIComponent(scopeId ?? '')}/statuses?listId=${encodeURIComponent(listId ?? '')}`,
      ),
    enabled: !!scopeId && !!listId,
  });
}

export interface SaveClickUpSyncPayload {
  listId: string;
  listName?: string;
  spaceId?: string;
  spaceName?: string;
  enabled: boolean;
  statusMap: ClickUpStatusPairDto[];
}

/**
 * Bind, or re-save the mapping.
 *
 * The response is written straight into the cache rather than invalidated: the
 * server reconciles the map and drops rows pointing at statuses the list doesn't
 * have, so what comes back is authoritative in a way the form's own state isn't.
 */
export function useSaveClickUpSync(scope: ClickUpSyncScope, scopeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveClickUpSyncPayload) =>
      apiPut<ClickUpSyncDto>(`/clickup/sync/${scope}/${encodeURIComponent(scopeId)}`, input),
    onSuccess: (fresh) => qc.setQueryData(syncKey(scope, scopeId), fresh),
  });
}

export function useDeleteClickUpSync(scope: ClickUpSyncScope, scopeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiDelete<{ ok: boolean }>(`/clickup/sync/${scope}/${encodeURIComponent(scopeId)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: syncKey(scope, scopeId) }),
  });
}
