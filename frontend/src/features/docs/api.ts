import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiDownload, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';
import { getLocale, t } from '@/i18n';
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

/**
 * One page with its body — what the editor reads.
 *
 * The **one query that opts out of the app's refetch-on-event policy** (see
 * `queryClient`). Everywhere else this cache mirrors the server and a background
 * refetch can only improve it; here the UI owns it. The autosave writes the
 * server's own response back into this key, and a Y.Doc-backed page treats it as
 * a mirror of state the CRDT holds — so a refetch fired by an alt-tab while a
 * debounced save is still in flight would put the pre-save body back into the
 * cache. Nothing on screen changes (Editor.js reads its content once, at mount),
 * which is what makes it nasty: you'd only see it after switching pages and back.
 *
 * Only the *behind your back* triggers are off. Opening the page still refetches
 * — that's a deliberate navigation, and the moment Editor.js re-reads its
 * content anyway, so a teammate's changes land exactly when you go to look at
 * them. (`staleTime: Infinity` would have covered focus too, and cost that.)
 */
export function useDocPage(docId: string | undefined, pageId: string | undefined) {
  return useQuery({
    queryKey: ['doc-page', docId, pageId],
    queryFn: () => apiGet<DocPageDto>(`/docs/${docId}/pages/${pageId}`),
    enabled: !!docId && !!pageId,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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

/** Titles are capped at 160 by both the API and the database. */
const MAX_DOC_TITLE = 160;

/**
 * What a copy is called: `<title> (copy)`, in the reader's language, trimmed to
 * fit. The suffix is the part that says what this doc is, so a title already at
 * the cap gives up its tail rather than losing it — send a longer one and the
 * API rejects the whole request.
 */
export function copyDocTitle(title: string): string {
  const suffix = t('docs.copySuffix');
  if (title.length + suffix.length <= MAX_DOC_TITLE) return `${title}${suffix}`;
  return `${title.slice(0, MAX_DOC_TITLE - suffix.length).trimEnd()}${suffix}`;
}

/**
 * Copies a doc and every page in it — the tree, the bodies, the files, the page
 * styles. The share link, version history, comment threads and record links stay
 * with the original; see `DuplicateDocUseCase` for why each one does.
 */
export function useDuplicateDoc() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title?: string }) =>
      apiPost<DocDto>(`/docs/${id}/duplicate`, { title }),
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

/**
 * Take a doc out of the workspace pool, or put it back. Only its author (or an
 * admin) may — see `canSetDocPrivacy`; anyone else gets a 404, because the API
 * won't confirm a doc exists to someone who can't act on it.
 *
 * Invalidating `['docs']` matters more here than anywhere else in this file:
 * going private *removes rows from other lists too* — the hub for everyone else,
 * and the Docs strip on any issue the doc's pages are linked to. This client only
 * refetches its own; the rest catch up on their next load, which is the honest
 * behaviour for a change made in someone else's browser.
 */
export function useSetDocPrivacy() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, isPrivate }: { id: string; isPrivate: boolean }) =>
      apiPost<DocDto>(`/docs/${id}/privacy`, { isPrivate }),
    onSuccess: invalidate,
  });
}

/**
 * Who may flip that switch. Mirrors `DocEntity.canSetPrivacy` on the API — the
 * author decides who reads their doc, and an admin can still reach it once
 * they've left. Deliberately *not* `canWrite`: everyone who may edit a doc being
 * able to un-private it would make the setting a suggestion.
 *
 * A doc written before authorship was recorded has `createdBy: ''`, which matches
 * nobody — those are an admin's to manage.
 */
export function canSetDocPrivacy(
  doc: Pick<DocDto, 'createdBy'>,
  userId: string | undefined,
  isAdmin: boolean,
): boolean {
  return isAdmin || (!!doc.createdBy && doc.createdBy === userId);
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
