import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import type { ClickUpLinkDto, ClickUpPushTargetDto, ClickUpStatusDto } from '@/types/dto';
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

const pushTargetKey = (targetType: ClickUpLinkTarget, targetId: string) => [
  'clickup',
  'push-target',
  targetType,
  targetId,
];

/** `targetType`, `targetId` and (for a backlog item) `roadmapId`, as a query string. */
function targetQuery(target: ClickUpTarget): string {
  const params = new URLSearchParams({
    targetType: target.targetType,
    targetId: target.targetId,
  });
  if (target.roadmapId) params.set('roadmapId', target.roadmapId);
  return params.toString();
}

/** Which record something is being asked about. */
export interface ClickUpTarget {
  targetType: ClickUpLinkTarget;
  targetId: string;
  /** Required for a backlog item; ignored for an issue. */
  roadmapId?: string;
}

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

/**
 * Can this record be created in ClickUp, and in which list?
 *
 * Only asked once the workspace is known to be connected — pass `enabled` from
 * `useClickUpStatus`. Almost every workspace has no ClickUp at all, and a second
 * request per issue opened to be told "no" would be a request nobody needed.
 */
export function useClickUpPushTarget(target: ClickUpTarget, enabled = true) {
  return useQuery({
    queryKey: pushTargetKey(target.targetType, target.targetId),
    queryFn: () =>
      apiGet<ClickUpPushTargetDto>(`/clickup/links/push-target?${targetQuery(target)}`),
    enabled: enabled && !!target.targetId,
  });
}

/**
 * Create this record in ClickUp now, through its board's binding.
 *
 * Invalidates the availability alongside the links, because success is exactly
 * what makes the answer flip: the record now has a synced task, so the action
 * that produced it has to stop being offered.
 */
export function usePushClickUpTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (target: ClickUpTarget) => apiPost<ClickUpLinkDto>('/clickup/links/push', target),
    onSuccess: (_link, target) => {
      qc.invalidateQueries({ queryKey: linksKey(target.targetType, target.targetId) });
      qc.invalidateQueries({ queryKey: pushTargetKey(target.targetType, target.targetId) });
    },
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

/**
 * Paste a task onto this record.
 *
 * The push availability moves with it: on a bound board a paste is an *adoption*
 * — the record now has a synced task — so the offer to create one has to stop
 * being made in the same beat.
 */
export function useLinkClickUpTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LinkClickUpTaskPayload) => apiPost<ClickUpLinkDto>('/clickup/links', input),
    onSuccess: (_link, input) => {
      qc.invalidateQueries({ queryKey: linksKey(input.targetType, input.targetId) });
      qc.invalidateQueries({ queryKey: pushTargetKey(input.targetType, input.targetId) });
    },
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

/**
 * Stop syncing this one item with ClickUp, or resume it.
 *
 * One hook with a boolean rather than two, because it's one switch — and both
 * directions write the single row back the same way the refresh does, so the row
 * flips in place instead of the panel blinking.
 *
 * Nothing else needs invalidating: a detached link is still a `sync` link, so
 * "can this be created in ClickUp?" stays no through both directions. It's
 * *removing* the row that changes that answer — see `useUnlinkClickUpTask`.
 */
export function useSetClickUpLinkDetached(targetType: ClickUpLinkTarget, targetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, detached }: { id: string; detached: boolean }) =>
      apiPost<ClickUpLinkDto>(`/clickup/links/${id}/${detached ? 'detach' : 'attach'}`, {}),
    onSuccess: (fresh) =>
      qc.setQueryData<ClickUpLinkDto[]>(linksKey(targetType, targetId), (old) =>
        (old ?? []).map((l) => (l.id === fresh.id ? fresh : l)),
      ),
  });
}

/**
 * Remove a link. Invalidates the push availability as well as the list: taking
 * a detached link off a record whose board is still bound is exactly what makes
 * "Create in ClickUp" the right offer again.
 */
export function useUnlinkClickUpTask(targetType: ClickUpLinkTarget, targetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/clickup/links/${id}`),
    onSuccess: (_res, id) => {
      qc.setQueryData<ClickUpLinkDto[]>(linksKey(targetType, targetId), (old) =>
        (old ?? []).filter((l) => l.id !== id),
      );
      qc.invalidateQueries({ queryKey: pushTargetKey(targetType, targetId) });
    },
  });
}
