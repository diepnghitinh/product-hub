import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import type { IssueRelationDto } from '@/types/dto';
import type { IssueKind, RelationType } from '@/types/enums';

// Keyed by issue id alone — an issue's relations span both kinds (a task can be
// blocked by a bug), so the list is not scoped to a kind. Ids are globally unique.
const key = (issueId: string) => ['issue-links', issueId];

/** An issue's relations, resolved to the linked issue (kind/title/shortId/status). */
export function useIssueRelations(issueId: string | undefined) {
  return useQuery({
    queryKey: key(issueId ?? ''),
    queryFn: () => apiGet<IssueRelationDto[]>('/issue-links', { issueId }),
    enabled: !!issueId,
  });
}

export function useCreateIssueRelation() {
  const qc = useQueryClient();
  return useMutation({
    // `issueType` is the source end's kind — stored on the link; the target may be
    // a different kind. The picker chooses the target freely across kinds.
    mutationFn: (input: {
      issueType: IssueKind;
      sourceId: string;
      targetId: string;
      relationType: RelationType;
    }) => apiPost<IssueRelationDto[]>('/issue-links', input),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: key(vars.sourceId) }),
  });
}

export function useDeleteIssueRelation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; issueId: string }) =>
      apiDelete<void>(`/issue-links/${args.id}`),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: key(vars.issueId) }),
  });
}
