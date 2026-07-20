import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import type {
  CommentDto,
  PublicProjectView,
  PublicRoadmapView,
  PublicTeamBoardView,
} from '@/types/dto';

/**
 * Public reads (no auth): the shared `apiGet` attaches the JWT only when one is
 * stored, so an anonymous visitor sends no Authorization header. `retry: false`
 * keeps a 404 (bad/disabled token) from thrashing.
 */

export function usePublicProject(token: string | undefined) {
  return useQuery({
    queryKey: ['public-project', token],
    queryFn: () => apiGet<PublicProjectView>(`/public/projects/${token}`),
    enabled: !!token,
    retry: false,
  });
}

export function usePublicRoadmap(token: string | undefined) {
  return useQuery({
    queryKey: ['public-roadmap', token],
    queryFn: () => apiGet<PublicRoadmapView>(`/public/roadmaps/${token}`),
    enabled: !!token,
    retry: false,
  });
}

export function usePublicTeamBoard(token: string | undefined) {
  return useQuery({
    queryKey: ['public-team', token],
    queryFn: () => apiGet<PublicTeamBoardView>(`/public/teams/${token}`),
    enabled: !!token,
    retry: false,
  });
}

/** A single card's comments on a shared team board — fetched lazily on open. */
export function usePublicIssueComments(token: string | undefined, itemId: string | undefined) {
  return useQuery({
    queryKey: ['public-team-comments', token, itemId],
    queryFn: () => apiGet<CommentDto[]>(`/public/teams/${token}/items/${itemId}/comments`),
    enabled: !!token && !!itemId,
    retry: false,
  });
}
