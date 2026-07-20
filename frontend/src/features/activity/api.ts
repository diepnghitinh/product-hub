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

/**
 * A comment lives on a bug OR a task — one shared collection + shape, but
 * different routes, cache keys, and side effects (bug mentions feed the inbox;
 * task ones don't in v1). These subject-keyed hooks let the shared issue-detail
 * view talk to either thread without branching at the call site.
 */
export type IssueSubject = 'task' | 'bug';

function subjectConfig(subject: IssueSubject) {
  return subject === 'task'
    ? { base: 'tasks', listKey: 'task-comments', touchesInbox: false }
    : { base: 'bugs', listKey: 'comments', touchesInbox: true };
}

export function useIssueComments(subject: IssueSubject, id: string | undefined, enabled = true) {
  const { base, listKey } = subjectConfig(subject);
  return useQuery({
    queryKey: [listKey, id],
    queryFn: () => apiGet<CommentDto[]>(`/${base}/${id}/comments`),
    enabled: enabled && !!id,
  });
}

export function useCreateIssueComment(subject: IssueSubject, id: string) {
  const qc = useQueryClient();
  const { base, listKey, touchesInbox } = subjectConfig(subject);
  return useMutation({
    mutationFn: (input: CreateCommentInput) => apiPost<CommentDto>(`/${base}/${id}/comments`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [listKey, id] });
      if (touchesInbox) qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}

export function useUpdateIssueComment(subject: IssueSubject, id: string) {
  const qc = useQueryClient();
  const { base, listKey, touchesInbox } = subjectConfig(subject);
  return useMutation({
    mutationFn: ({ commentId, input }: { commentId: string; input: UpdateCommentInput }) =>
      apiPatch<CommentDto>(`/${base}/${id}/comments/${commentId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [listKey, id] });
      if (touchesInbox) qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}

export function useDeleteIssueComment(subject: IssueSubject, id: string) {
  const qc = useQueryClient();
  const { base, listKey, touchesInbox } = subjectConfig(subject);
  return useMutation({
    mutationFn: (commentId: string) => apiDelete<{ ok: true }>(`/${base}/${id}/comments/${commentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [listKey, id] });
      if (touchesInbox) qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}
