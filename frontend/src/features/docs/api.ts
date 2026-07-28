import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';
import type {
  DocDto,
  DocLink,
  DocPageDto,
  DocPageSummary,
  DocPageVersion,
  DocPageVersionSummary,
  LinkedDocPage,
} from '@/types/dto';

export function useDocs() {
  return useQuery({ queryKey: ['docs'], queryFn: () => apiGet<DocDto[]>('/docs') });
}

/** A doc + its page tree (no bodies — the rail only needs titles). */
export function useDoc(id: string | undefined) {
  return useQuery({
    queryKey: ['doc', id],
    queryFn: () => apiGet<DocDto>(`/docs/${id}`),
    enabled: !!id,
  });
}

/** One page with its body — what the editor reads. */
export function useDocPage(docId: string | undefined, pageId: string | undefined) {
  return useQuery({
    queryKey: ['doc-page', docId, pageId],
    queryFn: () => apiGet<DocPageDto>(`/docs/${docId}/pages/${pageId}`),
    enabled: !!docId && !!pageId,
  });
}

/** Doc pages attached to one record — rendered on an issue / roadmap item. */
export function useLinkedDocs(refId: string | undefined) {
  return useQuery({
    queryKey: ['doc-links', refId],
    queryFn: () => apiGet<LinkedDocPage[]>(`/docs/links?refId=${encodeURIComponent(refId!)}`),
    enabled: !!refId,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['docs'] });
    qc.invalidateQueries({ queryKey: ['doc'] });
  };
}

export function useCreateDoc() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: {
      title: string;
      icon?: string;
      color?: string | null;
      tags?: string[];
    }) => apiPost<DocDto>('/docs', input),
    onSuccess: invalidate,
  });
}

export function useUpdateDoc() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: {
        title?: string;
        icon?: string;
        color?: string | null;
        coverUrl?: string;
        /** Replaces the whole list — the editor always knows the full set. */
        tags?: string[];
      };
    }) => apiPatch<DocDto>(`/docs/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteDoc() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/docs/${id}`),
    onSuccess: invalidate,
  });
}

/** Toggle a doc's public read-only link (the token is minted/kept server-side). */
export function useSetDocSharing() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiPost<DocDto>(`/docs/${id}/share`, { enabled }),
    onSuccess: invalidate,
  });
}

export function useCreateDocPage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      docId,
      input,
    }: {
      docId: string;
      input: { title?: string; parentId?: string; content?: string };
    }) => apiPost<DocPageDto>(`/docs/${docId}/pages`, input),
    onSuccess: invalidate,
  });
}

/**
 * Saves a page. Autosave fires this on a debounce, so the fresh body is written
 * straight into the page cache instead of waiting for a refetch — otherwise a
 * refetch landing mid-typing would remount the editor under the cursor. The
 * doc's tree is still invalidated: the title in the rail has to follow.
 */
export function useUpdateDocPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      pageId,
      input,
    }: {
      docId: string;
      pageId: string;
      input: {
        title?: string;
        icon?: string;
        color?: string | null;
        coverUrl?: string;
        content?: string;
        links?: DocLink[];
      };
    }) => apiPatch<DocPageDto>(`/docs/${docId}/pages/${pageId}`, input),
    onSuccess: (page) => {
      qc.setQueryData<DocPageDto>(['doc-page', page.docId, page.id], page);
      qc.invalidateQueries({ queryKey: ['doc', page.docId] });
      qc.invalidateQueries({ queryKey: ['docs'] });
      qc.invalidateQueries({ queryKey: ['doc-links'] });
    },
  });
}

/** Deletes a page *and every page nested under it* — the server returns the ids. */
export function useDeleteDocPage() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ docId, pageId }: { docId: string; pageId: string }) =>
      apiDelete<{ ok: true; deletedIds: string[] }>(`/docs/${docId}/pages/${pageId}`),
    onSuccess: (res, { docId }) => {
      res.deletedIds.forEach((id) => qc.removeQueries({ queryKey: ['doc-page', docId, id] }));
      qc.invalidateQueries({ queryKey: ['doc-links'] });
      invalidate();
    },
  });
}

// ── Version history ──────────────────────────────────────────────────────────

/** A page's saved versions, newest first. Bodies don't travel with the list. */
export function useDocPageVersions(
  docId: string | undefined,
  pageId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ['doc-page-versions', docId, pageId],
    queryFn: () =>
      apiGet<DocPageVersionSummary[]>(`/docs/${docId}/pages/${pageId}/versions`),
    // Only fetched once the history panel is open — nobody pays for it otherwise.
    enabled: enabled && !!docId && !!pageId,
  });
}

/** One version with its body — read when a version is picked for preview. */
export function useDocPageVersion(
  docId: string | undefined,
  pageId: string | undefined,
  versionId: string | undefined,
) {
  return useQuery({
    queryKey: ['doc-page-version', docId, pageId, versionId],
    queryFn: () =>
      apiGet<DocPageVersion>(`/docs/${docId}/pages/${pageId}/versions/${versionId}`),
    enabled: !!docId && !!pageId && !!versionId,
    // A version never changes, so once read it never needs re-reading.
    staleTime: Infinity,
  });
}

export function useSaveDocPageVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      pageId,
      label,
    }: {
      docId: string;
      pageId: string;
      label?: string;
    }) =>
      apiPost<DocPageVersionSummary>(`/docs/${docId}/pages/${pageId}/versions`, { label }),
    onSuccess: (_v, { docId, pageId }) => {
      qc.invalidateQueries({ queryKey: ['doc-page-versions', docId, pageId] });
    },
  });
}

/**
 * Puts an old version back. The server snapshots the live page first, so the
 * history list gains a row too — invalidate it alongside the page itself.
 */
export function useRestoreDocPageVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      pageId,
      versionId,
    }: {
      docId: string;
      pageId: string;
      versionId: string;
    }) =>
      apiPost<DocPageDto>(`/docs/${docId}/pages/${pageId}/versions/${versionId}/restore`, {}),
    onSuccess: (page) => {
      qc.setQueryData<DocPageDto>(['doc-page', page.docId, page.id], page);
      qc.invalidateQueries({ queryKey: ['doc-page-versions', page.docId, page.id] });
      qc.invalidateQueries({ queryKey: ['doc', page.docId] });
      qc.invalidateQueries({ queryKey: ['docs'] });
    },
  });
}

/**
 * Commits a drag: every moved page's new parent + order in one request.
 * Optimistic — the rail keeps the drop rather than snapping back while the
 * server answers, and restores the previous tree if the write fails.
 */
export function useReorderDocPages() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      docId,
      pages,
    }: {
      docId: string;
      pages: { id: string; parentId: string; order: number }[];
      /** The whole tree as it should look after the drop (optimistic paint). */
      next?: DocPageSummary[];
    }) => apiPut<DocPageSummary[]>(`/docs/${docId}/pages`, { pages }),
    onMutate: async ({ docId, next }) => {
      if (!next) return {};
      await qc.cancelQueries({ queryKey: ['doc', docId] });
      const prev = qc.getQueryData<DocDto>(['doc', docId]);
      qc.setQueryData<DocDto>(['doc', docId], (old) => (old ? { ...old, pages: next } : old));
      return { prev };
    },
    onError: (_err, { docId }, ctx) => {
      if (ctx?.prev) qc.setQueryData(['doc', docId], ctx.prev);
    },
    onSettled: invalidate,
  });
}
