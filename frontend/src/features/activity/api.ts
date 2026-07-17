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

export function useComments(bugId: string | undefined) {
  return useQuery({
    queryKey: ['comments', bugId],
    queryFn: () => apiGet<CommentDto[]>(`/bugs/${bugId}/comments`),
    enabled: !!bugId,
  });
}

export function useCreateComment(bugId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      apiPost<CommentDto>(`/bugs/${bugId}/comments`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', bugId] });
      qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}

export function useUpdateComment(bugId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCommentInput }) =>
      apiPatch<CommentDto>(`/bugs/${bugId}/comments/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', bugId] });
      qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}

export function useDeleteComment(bugId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/bugs/${bugId}/comments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', bugId] });
      qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}

// ── Task comments — the task-side twin (own thread, not inbox-linked in v1) ──

export function useTaskComments(taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: () => apiGet<CommentDto[]>(`/tasks/${taskId}/comments`),
    enabled: !!taskId,
  });
}

export function useCreateTaskComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      apiPost<CommentDto>(`/tasks/${taskId}/comments`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-comments', taskId] }),
  });
}

export function useUpdateTaskComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCommentInput }) =>
      apiPatch<CommentDto>(`/tasks/${taskId}/comments/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-comments', taskId] }),
  });
}

export function useDeleteTaskComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/tasks/${taskId}/comments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-comments', taskId] }),
  });
}
