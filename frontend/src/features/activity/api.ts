import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import type { CommentDto } from '@/types/dto';

export interface CreateCommentInput {
  body: string;
  mentions?: string[];
  images?: string[];
}

export interface UpdateCommentInput {
  body?: string;
  mentions?: string[];
  images?: string[];
}

/** The two issue threads share the `IssueDetailMain` view. */
export type IssueSubject = 'task' | 'bug';

/**
 * A comment lives on a bug, a task, OR a roadmap item — one shared collection +
 * shape, but different routes, cache keys, and side effects (bug mentions feed
 * the inbox; the others don't in v1). A `CommentSource` names which thread, so
 * the shared comment thread can talk to any of them without branching at the
 * call site. `id` is the subject id; a roadmap item also needs its `roadmapId`
 * because items live inside their roadmap.
 */
export type CommentSource =
  | { kind: 'bug'; id: string }
  | { kind: 'task'; id: string }
  | { kind: 'roadmapItem'; roadmapId: string; id: string };

interface SourceConfig {
  /** Route prefix before `/comments`, ids already interpolated. */
  base: string;
  /** React-query list key for this thread. */
  listKey: string;
  /** Whether a change here should also refresh the inbox (bug mentions only). */
  touchesInbox: boolean;
}

function sourceConfig(source: CommentSource): SourceConfig {
  switch (source.kind) {
    case 'task':
      return { base: `tasks/${source.id}`, listKey: 'task-comments', touchesInbox: false };
    case 'roadmapItem':
      return {
        base: `roadmaps/${source.roadmapId}/items/${source.id}`,
        listKey: 'roadmap-item-comments',
        touchesInbox: false,
      };
    case 'bug':
    default:
      return { base: `bugs/${source.id}`, listKey: 'comments', touchesInbox: true };
  }
}

export function useComments(source: CommentSource, enabled = true) {
  const { base, listKey } = sourceConfig(source);
  return useQuery({
    queryKey: [listKey, source.id],
    queryFn: () => apiGet<CommentDto[]>(`/${base}/comments`),
    enabled: enabled && !!source.id,
  });
}

export function useCreateComment(source: CommentSource) {
  const qc = useQueryClient();
  const { base, listKey, touchesInbox } = sourceConfig(source);
  return useMutation({
    mutationFn: (input: CreateCommentInput) => apiPost<CommentDto>(`/${base}/comments`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [listKey, source.id] });
      if (touchesInbox) qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}

export function useUpdateComment(source: CommentSource) {
  const qc = useQueryClient();
  const { base, listKey, touchesInbox } = sourceConfig(source);
  return useMutation({
    mutationFn: ({ commentId, input }: { commentId: string; input: UpdateCommentInput }) =>
      apiPatch<CommentDto>(`/${base}/comments/${commentId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [listKey, source.id] });
      if (touchesInbox) qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}

export function useDeleteComment(source: CommentSource) {
  const qc = useQueryClient();
  const { base, listKey, touchesInbox } = sourceConfig(source);
  return useMutation({
    mutationFn: (commentId: string) => apiDelete<{ ok: true }>(`/${base}/comments/${commentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [listKey, source.id] });
      if (touchesInbox) qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}
