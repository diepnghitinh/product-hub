import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import type { CommentDto } from '@/types/dto';

export interface CreateCommentInput {
  body: string;
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
