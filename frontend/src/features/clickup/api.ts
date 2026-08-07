import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import type { ClickUpLinkDto, ClickUpStatusDto } from '@/types/dto';
import type { ClickUpLinkTarget } from '@/types/enums';

/**
 * ClickUp links, from the working end.
 *
 * Its own module rather than living in `features/settings`: an issue and a
 * backlog item both render the same panel, and neither has anything to do with
 * the admin screen where the workspace is connected.
 */

const linksKey = (targetType: ClickUpLinkTarget, targetId: string) => [
  'clickup',
  'links',
  targetType,
  targetId,
];

/**
 * Is ClickUp linking available at all?
 *
 * Readable by anyone, unlike the connection itself, because everyone who can
 * edit an issue needs it to decide whether to show the Link button. Cached for
 * the session — a workspace is connected roughly never.
 */
export function useClickUpStatus() {
  return useQuery({
    queryKey: ['clickup', 'status'],
    queryFn: () => apiGet<ClickUpStatusDto>('/settings/clickup/status'),
    staleTime: 5 * 60_000,
  });
}

/** The ClickUp tasks linked to one issue or backlog item. */
export function useClickUpLinks(
  targetType: ClickUpLinkTarget,
  targetId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: linksKey(targetType, targetId ?? ''),
    queryFn: () =>
      apiGet<ClickUpLinkDto[]>(
        `/clickup/links?targetType=${targetType}&targetId=${encodeURIComponent(targetId ?? '')}`,
      ),
    enabled: enabled && !!targetId,
  });
}

export interface LinkClickUpTaskPayload {
  /** A task URL, a task id, or a custom id — the server works out which. */
  reference: string;
  targetType: ClickUpLinkTarget;
  targetId: string;
  /** Required for a backlog item; ignored for an issue. */
  roadmapId?: string;
}

export function useLinkClickUpTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LinkClickUpTaskPayload) => apiPost<ClickUpLinkDto>('/clickup/links', input),
    onSuccess: (_link, input) =>
      qc.invalidateQueries({ queryKey: linksKey(input.targetType, input.targetId) }),
  });
}

/**
 * Re-read one task from ClickUp now.
 *
 * The single-row response is written straight back into the list rather than
 * refetching: the user pressed a button on one row and should see that row
 * change, not the whole panel blink.
 */
export function useRefreshClickUpLink(targetType: ClickUpLinkTarget, targetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<ClickUpLinkDto>(`/clickup/links/${id}/refresh`, {}),
    onSuccess: (fresh) =>
      qc.setQueryData<ClickUpLinkDto[]>(linksKey(targetType, targetId), (old) =>
        (old ?? []).map((l) => (l.id === fresh.id ? fresh : l)),
      ),
  });
}

export function useUnlinkClickUpTask(targetType: ClickUpLinkTarget, targetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/clickup/links/${id}`),
    onSuccess: (_res, id) =>
      qc.setQueryData<ClickUpLinkDto[]>(linksKey(targetType, targetId), (old) =>
        (old ?? []).filter((l) => l.id !== id),
      ),
  });
}
