import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import type { IssueRelationDto } from '@/types/dto';
import type { IssueKind, RelationType } from '@/types/enums';

const key = (issueType: IssueKind, issueId: string) => ['issue-links', issueType, issueId];

/** An issue's relations, resolved to the linked issue (title/shortId/status). */
export function useIssueRelations(issueType: IssueKind, issueId: string | undefined) {
  return useQuery({
    queryKey: key(issueType, issueId ?? ''),
    queryFn: () => apiGet<IssueRelationDto[]>('/issue-links', { issueType, issueId }),
    enabled: !!issueId,
  });
}

export function useCreateIssueRelation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      issueType: IssueKind;
      sourceId: string;
      targetId: string;
      relationType: RelationType;
    }) => apiPost<IssueRelationDto[]>('/issue-links', input),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: key(vars.issueType, vars.sourceId) }),
  });
}

export function useDeleteIssueRelation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; issueType: IssueKind; issueId: string }) =>
      apiDelete<void>(`/issue-links/${args.id}`),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: key(vars.issueType, vars.issueId) }),
  });
}
