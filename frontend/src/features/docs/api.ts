import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiDownload, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';
import { getLocale } from '@/i18n';
import type {
  CommentDto,
  DocAttachment,
  DocDto,
  DocLink,
  DocPageCommentCount,
  DocPageDto,
  DocPageSummary,
  DocPageVersion,
  DocPageVersionSummary,
  LinkedDocPage,
} from '@/types/dto';
import type { DocPageStyle } from './pageStyle';

export function useDocs() {
  return useQuery({ queryKey: ['docs'], queryFn: () => apiGet<DocDto[]>('/docs') });
}

/**
 * A doc + its page tree (no bodies — the rail only needs titles).
 *
 * `idOrRef` is whatever the URL carried: a `DOC-6HCUHKX` ref for a link made
 * today, the uuid for one made before refs existed. The server resolves both, so
 * this key is *not* reliably the doc's id — anything writing to this cache must
 * match by prefix and compare `data.id`, never assume `['doc', uuid]`.
 */
export function useDoc(idOrRef: string | undefined) {
  return useQuery({
    queryKey: ['doc', idOrRef],
    queryFn: () => apiGet<DocDto>(`/docs/${idOrRef}`),
    enabled: !!idOrRef,
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
        /** Replaces the whole list — the row always knows the full set. */
        attachments?: DocAttachment[];
        // Page Styles ride the same patch, flat and one at a time — the panel
        // changes a single control and sends only that.
      } & Partial<DocPageStyle>;
    }) => apiPatch<DocPageDto>(`/docs/${docId}/pages/${pageId}`, input),
    onSuccess: (page) => {
      qc.setQueryData<DocPageDto>(['doc-page', page.docId, page.id], page);
      // Prefix, not ['doc', docId]: the doc is cached under whatever key the URL
      // used, which is its ref rather than its uuid on a modern link.
      qc.invalidateQueries({ queryKey: ['doc'] });
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

/**
 * Download one page as a PDF.
 *
 * The paper is rendered on the server by a real browser, so what lands in the
 * file is the page as it reads here — same typography, same diagrams — not a
 * screenshot of this tab and not something the print dialog reinterpreted. A
 * mutation rather than a query because it's an action with no cached result:
 * `isPending` is what greys the menu item while Chrome is drawing.
 *
 * The locale rides along for the handful of words the server adds around the
 * body ("Updated by", "Attachments").
 */
export function useExportDocPagePdf() {
  return useMutation({
    mutationFn: ({ docId, pageId, title }: { docId: string; pageId: string; title: string }) =>
      apiDownload(`/docs/${docId}/pages/${pageId}/pdf`, `${title || 'document'}.pdf`, {
        locale: getLocale(),
      }),
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
      // Prefix — see the note on `useDoc`: the cache key may be the doc's ref.
      qc.invalidateQueries({ queryKey: ['doc'] });
      qc.invalidateQueries({ queryKey: ['docs'] });
    },
  });
}

// ── Comments ─────────────────────────────────────────────────────────────────

/** What a new thread is about. Absent on a reply, and on a page-level note. */
export interface DocCommentAnchor {
  anchorExact?: string;
  anchorPrefix?: string;
  anchorSuffix?: string;
  anchorStart?: number;
}

export interface CreateDocCommentInput extends DocCommentAnchor {
  body: string;
  mentions?: string[];
  images?: string[];
  /** When set, post as a reply to this thread's top-level comment. */
  parentId?: string;
}

/** Every comment on one page, oldest first — resolved ones included, since the
 *  sidebar offers them behind a filter rather than hiding them for good. */
export function useDocComments(docId: string | undefined, pageId: string | undefined) {
  return useQuery({
    queryKey: ['doc-comments', docId, pageId],
    queryFn: () => apiGet<CommentDto[]>(`/docs/${docId}/pages/${pageId}/comments`),
    enabled: !!docId && !!pageId,
  });
}

/** Open-thread counts for every page of a doc, for the rail's badges. One
 *  aggregate rather than a request per page. */
export function useDocCommentCounts(docId: string | undefined) {
  return useQuery({
    queryKey: ['doc-comment-counts', docId],
    queryFn: () => apiGet<DocPageCommentCount[]>(`/docs/${docId}/comment-counts`),
    enabled: !!docId,
  });
}

/**
 * Anything that changes a thread refreshes the page's list and the doc's badges.
 * The inbox goes too: a doc mention lands there the same way a bug mention does.
 */
function useCommentInvalidate(docId: string | undefined, pageId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['doc-comments', docId, pageId] });
    qc.invalidateQueries({ queryKey: ['doc-comment-counts', docId] });
    qc.invalidateQueries({ queryKey: ['inbox'] });
  };
}

export function useCreateDocComment(docId: string | undefined, pageId: string | undefined) {
  const invalidate = useCommentInvalidate(docId, pageId);
  return useMutation({
    mutationFn: (input: CreateDocCommentInput) =>
      apiPost<CommentDto>(`/docs/${docId}/pages/${pageId}/comments`, input),
    onSuccess: invalidate,
  });
}

export function useUpdateDocComment(docId: string | undefined, pageId: string | undefined) {
  const invalidate = useCommentInvalidate(docId, pageId);
  return useMutation({
    mutationFn: ({
      commentId,
      input,
    }: {
      commentId: string;
      input: { body?: string; mentions?: string[]; images?: string[] };
    }) => apiPatch<CommentDto>(`/docs/${docId}/pages/${pageId}/comments/${commentId}`, input),
    onSuccess: invalidate,
  });
}

/** Tick a thread off, or bring it back. Resolving a reply resolves its root. */
export function useResolveDocComment(docId: string | undefined, pageId: string | undefined) {
  const invalidate = useCommentInvalidate(docId, pageId);
  return useMutation({
    mutationFn: ({ commentId, resolved }: { commentId: string; resolved: boolean }) =>
      apiPost<CommentDto>(`/docs/${docId}/pages/${pageId}/comments/${commentId}/resolve`, {
        resolved,
      }),
    onSuccess: invalidate,
  });
}

/** Deleting a thread's first comment takes its replies with it. */
export function useDeleteDocComment(docId: string | undefined, pageId: string | undefined) {
  const invalidate = useCommentInvalidate(docId, pageId);
  return useMutation({
    mutationFn: (commentId: string) =>
      apiDelete<{ ok: true }>(`/docs/${docId}/pages/${pageId}/comments/${commentId}`),
    onSuccess: invalidate,
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
    // The doc's cache key is whatever the URL carried (ref *or* uuid), so the
    // entry to patch is found by prefix and matched on the payload's own id —
    // guessing `['doc', docId]` would silently miss and the drag would snap back.
    onMutate: async ({ docId, next }) => {
      if (!next) return {};
      await qc.cancelQueries({ queryKey: ['doc'] });
      const prev = qc
        .getQueriesData<DocDto>({ queryKey: ['doc'] })
        .filter(([, data]) => data?.id === docId);
      prev.forEach(([key]) =>
        qc.setQueryData<DocDto>(key, (old) => (old ? { ...old, pages: next } : old)),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: invalidate,
  });
}
