import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { Check, History, Image as ImageIcon, Link2, Loader2, Paintbrush, X } from 'lucide-react';
import { Button, Drawer, RichText, RichTextEditor, SymbolPicker } from '@/components/ui';
import { MediaUploader } from '@/components/MediaUploader';
import { ProseSkeleton } from '@/components/Skeletons';
import { TeamSymbol, TEAM_SYMBOL_NAMES } from '@/components/TeamSymbol';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { timeAgo } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { contentRoot, describeRange, type TextAnchor } from '@/lib/textAnchor';
import { DocLinkKind, IssueKind, TEAM_COLORS } from '@/types/enums';
import type { DocAttachment, DocLink, DocPageDto } from '@/types/dto';
import { useDoc, useDocComments, useUpdateDocPage } from '../api';
import { CollabDocEditor } from '../collab/CollabDocEditor';
import { CollabLive, CollabPresence } from '../collab/CollabPresence';
import { resetCollabDoc } from '../collab/resetCollabDoc';
import { useCollabSession } from '../collab/useCollabSession';
import { pageStyleOf, typographyAttrs, widthClass, type DocPageStyle } from '../pageStyle';
import { DocAttachments } from './DocAttachments';
import { DocComments } from './DocComments';
import {
  DocCommentLayer,
  PENDING_ID,
  SelectionCommentButton,
  threadAtPoint,
  useAnchorLayout,
  useSelectionPrompt,
  type AnchoredThread,
} from './DocCommentLayer';
import { DocLinkDialog } from './DocLinkDialog';
import { DocPageStyles } from './DocPageStyles';
import { DocVersionHistory } from './DocVersionHistory';

interface DocPageEditorProps {
  page: DocPageDto;
  canWrite: boolean;
  /** The comments rail, toggled from the header a level up. */
  commentsOpen?: boolean;
  onCommentsOpenChange?: (open: boolean) => void;
  /** A thread to open on arrival — an inbox mention links straight to one. */
  focusCommentId?: string | null;
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved';

/** Typing pauses this long before a save goes out. */
const AUTOSAVE_MS = 900;

type PagePatch = {
  title?: string;
  icon?: string;
  color?: string | null;
  coverUrl?: string;
  content?: string;
  links?: DocLink[];
  attachments?: DocAttachment[];
} & Partial<DocPageStyle>;

/** Where a linked record lives, so the chip is a real link, not a label. */
function linkHref(link: DocLink): string {
  if (link.kind === DocLinkKind.ROADMAP_ITEM)
    return `/roadmaps/${link.roadmapId}/items/${link.refId}`;
  return `/${link.issueKind === IssueKind.BUG ? 'bugs' : 'tasks'}/${link.refId}`;
}

/**
 * One doc page: cover, icon, title, the records it's attached to, and the
 * Editor.js body. Everything autosaves on a pause in typing — there's no Save
 * button, so the status line beside the byline is what tells you where you stand.
 *
 * Mount this with `key={page.id}`: Editor.js reads its value once, at mount, so
 * switching pages has to be a fresh mount rather than a prop change.
 */
export function DocPageEditor({
  page,
  canWrite,
  commentsOpen = false,
  onCommentsOpenChange,
  focusCommentId,
}: DocPageEditorProps) {
  const update = useUpdateDocPage();
  // Already loaded by the workspace around us — read from cache, for the one
  // thing this component can't answer alone: which other pages "apply to all"
  // means.
  const { data: doc } = useDoc(page.docId);
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState(page.icon);
  const [color, setColor] = useState<string | null>(page.color ?? null);
  const [coverUrl, setCoverUrl] = useState(page.coverUrl);
  const [links, setLinks] = useState<DocLink[]>(page.links);
  // Pages written before attachments existed come back without the field.
  const [files, setFiles] = useState<DocAttachment[]>(page.attachments ?? []);
  // Page Styles. Held here, not read straight off `page`, so a switch flips
  // under the pointer instead of after the round trip.
  const [style, setStyle] = useState<DocPageStyle>(() => pageStyleOf(page));
  const [status, setStatus] = useState<SaveState>('idle');
  // Owned here, not passed down from the workspace: the button that opens it
  // now rides the page heading, so trigger and drawer live in one component.
  const [stylesOpen, setStylesOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  /**
   * What the editor was mounted with. Editor.js reads its value once, so the
   * only way to put different text in front of the cursor — which is exactly
   * what restoring a version does — is to remount it under a fresh key.
   */
  const [seed, setSeed] = useState({ nonce: 0, html: page.content });
  /**
   * The title box grows with its text rather than scrolling it out of sight —
   * a full-width heading only means something if a long title can take a second
   * line. The height is *measured*, not computed, so it has to be re-taken
   * whenever anything that moves the wrap point moves: the text itself, the
   * page's measure, the font face, or the window.
   */
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [title, style.showTitle, style.fontStyle, style.pageWidth]);

  // Every signed-in role except Guest may comment, mirroring the backend's
  // @Roles on those routes — a developer can't edit a doc's body but can
  // absolutely argue with it.
  const { user, canEditDelivery: canComment } = useAuth();

  // ── Live collaboration ────────────────────────────────────────────────────
  /**
   * When there's a sync server, the body is a CRDT and this page stops saving it.
   *
   * `useCollabSession` returns null when `VITE_COLLAB_URL` is unset, which is the
   * whole feature flag — no build depends on the service existing, and with it
   * off every line below behaves exactly as it did before. Only writers connect:
   * a reader is served the same static render as the public share view, so a
   * socket would buy them nothing but a socket.
   */
  const collab = useCollabSession({
    tenantId: user?.tenantId,
    pageId: page.id,
    user: user ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl } : null,
    enabled: canWrite,
  });
  /**
   * Wait for the first sync before showing the editor.
   *
   * Not politeness — correctness. BlockNote binds to the fragment immediately,
   * and an empty fragment is a legitimate document: mounting before the server's
   * state arrives shows a blank page for a moment, and any keystroke in that
   * moment is an edit to an empty document that then merges with the real one.
   */
  const collabReady = !!collab && collab.synced;
  const { data: comments } = useDocComments(page.docId, page.id);
  /** The box the highlights are measured and painted in. */
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  /** Where the prose lives inside it — editor or read-only render. */
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [draftAnchor, setDraftAnchor] = useState<TextAnchor | null>(null);
  const openComments = useCallback(
    (open: boolean) => onCommentsOpenChange?.(open),
    [onCommentsOpenChange],
  );

  const roots = useMemo(
    () => (comments ?? []).filter((c) => !c.parentId && !!c.anchorExact),
    [comments],
  );
  const threads = useMemo<AnchoredThread[]>(() => {
    const list = roots.map((c) => ({
      id: c.id,
      anchor: {
        exact: c.anchorExact,
        prefix: c.anchorPrefix,
        suffix: c.anchorSuffix,
        start: c.anchorStart,
      },
    }));
    // The draft rides along so you can see the passage you picked while writing.
    if (draftAnchor) list.push({ id: PENDING_ID, anchor: draftAnchor });
    return list;
  }, [roots, draftAnchor]);
  // Resolved threads are still measured — that's what keeps them in page order
  // in the rail — but they leave no mark on the page.
  const resolvedIds = useMemo(
    () => roots.filter((c) => c.resolved).map((c) => c.id),
    [roots],
  );

  const layout = useAnchorLayout({
    container: box,
    content,
    threads,
    revision: seed.nonce,
  });
  // While editing, "Comment" is a button in Editor.js's own inline toolbar; a
  // second floating one would land on top of it.
  const [prompt, clearPrompt] = useSelectionPrompt(box, content, canComment && !canWrite);

  const wide = useWideEnough();

  const startComment = useCallback(
    (anchor: TextAnchor) => {
      setDraftAnchor(anchor);
      setActiveComment(null);
      clearPrompt();
      openComments(true);
      window.getSelection()?.removeAllRanges();
    },
    [clearPrompt, openComments],
  );

  /** The editor's inline "Comment" button hands over the live selection —
   *  describe it against the same DOM the highlights are measured in. */
  const commentOnRange = useCallback(
    (range: Range) => {
      const root = contentRoot(content);
      if (!root) return;
      const anchor = describeRange(root, range);
      if (anchor) startComment(anchor);
    },
    [content, startComment],
  );

  /** Clicking a highlighted passage opens its thread. Hit-tested against the
   *  measured boxes rather than made clickable, so the highlight never eats the
   *  drag that selects text or the click that places the caret. */
  function pickThread(e: MouseEvent<HTMLDivElement>) {
    if (!box) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    const rect = box.getBoundingClientRect();
    const id = threadAtPoint(layout, e.clientX - rect.left, e.clientY - rect.top);
    if (!id) return;
    setActiveComment(id);
    openComments(true);
  }

  // Landing from a mention: open the rail on that thread.
  useEffect(() => {
    if (!focusCommentId) return;
    setActiveComment(focusCommentId);
    openComments(true);
  }, [focusCommentId, openComments]);

  // Fields edited since the last write. A ref, not state: the debounce reads it
  // when it fires, and re-rendering on every keystroke would fight the editor.
  const pending = useRef<PagePatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutate = useRef(update.mutateAsync);
  mutate.current = update.mutateAsync;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    setStatus('saving');
    try {
      await mutate.current({ docId: page.docId, pageId: page.id, input: patch });
      setStatus('saved');
    } catch {
      // Put the edit back so the next keystroke (or unmount) retries it rather
      // than silently dropping what was typed.
      pending.current = { ...patch, ...pending.current };
      setStatus('dirty');
    }
  }, [page.docId, page.id]);

  const queue = useCallback(
    (patch: PagePatch) => {
      pending.current = { ...pending.current, ...patch };
      setStatus('dirty');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [flush],
  );

  // Renaming this page from the rail lands in the page cache, not in this
  // component's state — adopt it, unless a title edit of ours is still queued
  // (that one is the newer of the two and would be clobbered).
  useEffect(() => {
    if (pending.current.title === undefined) setTitle(page.title);
  }, [page.title]);

  // Leaving the page (or the whole workspace) writes what's outstanding — a
  // debounce that never fired would otherwise lose the last few seconds.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => void flushRef.current(), []);

  // ⌘S / Ctrl+S saves now instead of waiting out the debounce.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void flushRef.current();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Meta changes (icon, cover, links) save straight away — they're deliberate
   *  single actions, not a stream of keystrokes. */
  function saveNow(patch: PagePatch) {
    pending.current = { ...pending.current, ...patch };
    void flush();
  }

  function addLink(link: DocLink) {
    const next = [...links, link];
    setLinks(next);
    setLinkOpen(false);
    saveNow({ links: next });
  }

  function removeLink(refId: string) {
    const next = links.filter((l) => l.refId !== refId);
    setLinks(next);
    saveNow({ links: next });
  }

  /**
   * One control from the Page Styles panel. Paints now, saves on the debounce
   * — *not* `saveNow`, deliberately: flipping three switches in a row would
   * otherwise fire three overlapping PATCHes of the same page, and the last one
   * to land would put the other two back. The debounce merges them into a
   * single write.
   */
  function changeStyle(patch: Partial<DocPageStyle>) {
    setStyle((s) => ({ ...s, ...patch }));
    queue(patch);
  }

  const otherPages = (doc?.pages ?? []).filter((p) => p.id !== page.id);

  /**
   * Copies *this* page's font, size and width onto every other page of the doc
   * — the switches stay per page, since "show the cover here" is a statement
   * about this page and not about the doc.
   *
   * Fanned out over the single-page endpoint rather than a bulk one, the way the
   * rest of the app does it. A plain PATCH doesn't snapshot a version, so this
   * doesn't fill anyone's history with a font change — it does move every page's
   * "updated by", which is fair: it did just edit them.
   */
  async function applyTypographyToAll() {
    // This page's own change may still be sitting in the debounce — write it
    // first so "all pages" really does include the one you're looking at.
    await flush();
    const typography = {
      fontStyle: style.fontStyle,
      fontSize: style.fontSize,
      pageWidth: style.pageWidth,
    };
    await Promise.all(
      otherPages.map((p) =>
        mutate.current({ docId: page.docId, pageId: p.id, input: typography }),
      ),
    );
  }

  // Offering "add a cover" while covers are switched off would contradict
  // itself, so the button follows the switch. Same reasoning for links: the
  // switch means "this page doesn't show them", and offering to attach one that
  // won't appear would be a promise the page then breaks.
  const showAddCover = canWrite && style.showCover && !coverUrl;
  const showAddLink = canWrite && style.showLinks;
  // The band under the heading is the chips alone now — attaching happens from
  // the row above the title — so with nothing linked there's nothing to draw,
  // writer or not.
  const linksOn = style.showLinks && links.length > 0;
  const filesOn = style.showAttachments && (canWrite || files.length > 0);
  const typo = typographyAttrs(style);

  /**
   * One row of quiet, icon-led buttons above the title, on its own line rather
   * than beside the name — which is what lets the title keep the full measure:
   * the row can grow, or wrap on a phone, and the heading never shortens to make
   * room for it.
   *
   * It splits in two on purpose. Attaching a record is *work* — the reason
   * someone opens this page in the first place — so it's always on screen and
   * always in the same spot, no hovering required to find out it exists.
   */
  const linkAction = showAddLink ? (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="text-muted-foreground"
      onClick={() => setLinkOpen(true)}
    >
      <Link2 className="mr-1.5 size-4" aria-hidden />
      {t('docs.linkRecord')}
    </Button>
  ) : null;

  /** The rest change how the page *looks* — occasional, and not what anyone came
   *  here to do, so they keep out of the way until pointed at. */
  const lookActions =
    showAddCover || canWrite ? (
      <>
        {showAddCover && (
          <MediaUploader
            accept="image/*"
            multiple={false}
            variant="ghost"
            label={t('docs.addCover')}
            // Beside "link" and "styles" the button names what it adds, not the
            // mechanism it adds it by — an upload arrow would be the odd one out.
            icon={<ImageIcon className="mr-1.5 size-4" aria-hidden />}
            className="text-muted-foreground"
            onUploaded={(m) => {
              setCoverUrl(m.url);
              saveNow({ coverUrl: m.url });
            }}
          />
        )}
        {canWrite && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setStylesOpen(true)}
          >
            <Paintbrush className="mr-1.5 size-4" aria-hidden />
            {t('docs.pageStyles')}
          </Button>
        )}
      </>
    ) : null;

  const rail = comments ? (
    <DocComments
      docId={page.docId}
      pageId={page.id}
      comments={comments}
      tops={layout.tops}
      orphaned={layout.orphaned}
      activeId={activeComment}
      onActivate={setActiveComment}
      pending={draftAnchor}
      onCancelPending={() => setDraftAnchor(null)}
    />
  ) : null;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-h-0 flex-1 overflow-y-auto">
      {coverUrl && style.showCover ? (
        <div className="group relative h-32 w-full overflow-hidden bg-muted sm:h-44">
          <img src={coverUrl} alt="" className="size-full object-cover" />
          {canWrite && (
            <div className="absolute right-3 top-3 flex gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
              <MediaUploader
                accept="image/*"
                multiple={false}
                label={t('docs.changeCover')}
                onUploaded={(m) => {
                  setCoverUrl(m.url);
                  saveNow({ coverUrl: m.url });
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setCoverUrl('');
                  saveNow({ coverUrl: '' });
                }}
              >
                {t('docs.removeCover')}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      <div
        {...typo}
        className={cn(
          typo.className,
          'mx-auto w-full px-4 pb-24 pt-6 sm:px-8',
          widthClass(style.pageWidth),
        )}
      >
        {/* Actions, then the name, then the byline — the heading reads top to
            bottom in the order you'd say it. Nothing shares the title's line, so
            the page's name gets the whole measure and is never clipped, however
            many actions the row grows to hold.
            Hidden, the title is still edited from the rail — that switch is
            about the page's own look, not about whether the page has a name. */}
        <div className="group">
          {(linkAction || lookActions) && (
            /* The row keeps its height whether or not the fading half is showing,
               so pointing at the heading never shoves the title down a line. */
            <div className="mb-1 flex min-h-8 flex-wrap items-center gap-0.5">
              {linkAction}
              {lookActions && (
                /* Faded rather than unmounted, and from `sm` up only: a phone has
                   no hover to reveal them with, so there they simply stay. While
                   faded out the group is `pointer-events-none` — an invisible row
                   that still swallowed clicks and lit the cursor up over blank
                   space would be worse than showing it. */
                <div
                  className={cn(
                    'flex flex-wrap items-center gap-0.5',
                    style.showTitle &&
                      'sm:pointer-events-none sm:opacity-0 sm:transition-opacity sm:focus-within:pointer-events-auto sm:focus-within:opacity-100 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100',
                  )}
                >
                  {lookActions}
                </div>
              )}
            </div>
          )}

          {style.showTitle && (
            <div className="flex items-start gap-2">
              {/* A box the height of the title's first line, so the icon centres
                  on that line and stays put when the title wraps — whichever of
                  the two symbols is rendered, and at either title size. */}
              <div className="flex h-8 shrink-0 items-center sm:h-9">
                {canWrite ? (
                  <SymbolPicker
                    variant="plain"
                    size={26}
                    value={icon || 'book'}
                    color={color}
                    options={TEAM_SYMBOL_NAMES}
                    colors={TEAM_COLORS}
                    ariaLabel={t('docs.pageIcon')}
                    onChange={(patch) => {
                      // The picker sends whichever half changed, so patch just
                      // that one — writing both would blank the other to its
                      // default.
                      const next: PagePatch = {};
                      if (patch.icon !== undefined) {
                        setIcon(patch.icon);
                        next.icon = patch.icon;
                      }
                      if (patch.color !== undefined) {
                        setColor(patch.color);
                        next.color = patch.color;
                      }
                      saveNow(next);
                    }}
                  />
                ) : (
                  <TeamSymbol
                    name={icon || 'book'}
                    size={26}
                    className="shrink-0 text-muted-foreground"
                    color={color ?? undefined}
                  />
                )}
              </div>
              {/* A textarea, not an input: an input can only ever scroll a long
                  title sideways past its own edge, which is the thing being
                  fixed here. The *value* stays one line — Enter commits, and a
                  pasted line break collapses to a space rather than becoming
                  part of the name — it just wraps instead of hiding text. */}
              <textarea
                ref={titleRef}
                value={title}
                readOnly={!canWrite}
                rows={1}
                onChange={(e) => {
                  const next = e.target.value.replace(/\s*[\r\n]+\s*/g, ' ');
                  setTitle(next);
                  queue({ title: next });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                onBlur={() => void flush()}
                aria-label={t('docs.pageTitle')}
                placeholder={t('docs.untitled')}
                className="min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/60 sm:text-3xl"
              />
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {/* Only the byline itself is switchable. Save status and history are
              controls, not decoration — losing them would cost you the page. */}
          {style.showUpdated && (
            <span>
              {t('docs.updatedBy')
                .replace('{name}', page.updatedByName || '—')
                .replace('{when}', timeAgo(page.updatedAt))}
            </span>
          )}
          {/* Who's here now, in the row that already answers "who touched this"
              — the same question asked in the present tense. */}
          {collab && (
            <CollabPresence peers={collab.peers} status={collab.status} />
          )}
          {/* With a CRDT there is no save to report: the body is saved the
              instant it is typed, and a "Saving…" that never appears would just
              be a widget nobody can interpret. Title and page styles still go
              over REST, so the indicator stays for those — it simply has less to
              say than it used to, which is why "Live" stands in beside it and
              says the reassuring part instead. Writers only: a reader has no
              work in flight to reassure them about. */}
          {collab && canWrite && <CollabLive status={collab.status} />}
          <SaveStatus status={status} />
          {/* Sits with the byline because that's where "when did this change"
              already lives — history is the long answer to the same question. */}
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="inline-flex items-center gap-1 rounded transition-colors hover:text-foreground"
          >
            <History className="size-3" aria-hidden /> {t('docs.versionHistory')}
          </button>
        </div>

        {/* Links and files share one rule: both answer "what else belongs with
            this page". A reader with nothing attached and no way to attach gets
            no empty band across the page. */}
        {(linksOn || filesOn) && (
          <div className="mt-4 space-y-2 border-y py-2.5">
            {linksOn && (
            <div className="flex flex-wrap items-center gap-2">
              {links.map((link) => (
                <span
                  key={link.refId}
                  className="group inline-flex items-center gap-1 rounded-md border bg-muted/40 py-1 pl-2 pr-1 text-xs"
                >
                  <Link
                    to={linkHref(link)}
                    className="max-w-[220px] truncate font-medium text-foreground hover:text-primary"
                  >
                    {link.title}
                  </Link>
                  {canWrite && (
                    <button
                      type="button"
                      aria-label={t('docs.linkRemove')}
                      title={t('docs.linkRemove')}
                      onClick={() => removeLink(link.refId)}
                      className="grid size-4 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            )}

            {filesOn && (
              <DocAttachments
                items={files}
                canWrite={canWrite}
                onChange={(next) => {
                  setFiles(next);
                  saveNow({ attachments: next });
                }}
              />
            )}
          </div>
        )}

        {/* The body, and the comment highlights behind it. The layer is a
            sibling at z-0 with the prose lifted to z-1, so a highlight paints
            *under* the text — nothing is ever injected into the content itself. */}
        <div ref={setBox} className="relative mt-4">
          <DocCommentLayer layout={layout} activeId={activeComment} hiddenIds={resolvedIds} />
          <div ref={setContent} className="relative z-[1]" onClick={pickThread}>
            {collab ? (
              /* The collaborative body. Note what's missing: no `value`, and no
                 `onChange` that queues a save. That absence *is* the feature —
                 the Y.Doc is the document, and the sync server renders it back
                 into `content` on its own debounce. Two people can type in the
                 same paragraph because nobody is PATCHing an HTML string over
                 the top of anybody else. Everything else on this page (title,
                 icon, links, files, styles) still saves over REST exactly as
                 before; only the body moved. */
              collabReady ? (
                <CollabDocEditor
                  session={collab}
                  onComment={canComment ? commentOnRange : undefined}
                />
              ) : (
                <ProseSkeleton />
              )
            ) : canWrite ? (
              <RichTextEditor
                key={seed.nonce}
                value={seed.html}
                images
                diagrams
                // `@` names a person in the page itself, the way it already does
                // in a task or a comment. The chip is a reference, not a ping:
                // notifications come from the comment thread, which is where a
                // question actually gets asked.
                mentions
                minHeight={360}
                placeholder={t('docs.write')}
                onChange={(html) => queue({ content: html })}
                onComment={canComment ? (range) => commentOnRange(range) : undefined}
                commentLabel={t('docs.comments.add')}
                // A doc page *is* the document — the skin drops the frame + focus
                // ring and reads at body size (see rich-text-editor.css).
                className="doc-page"
              />
            ) : (
              // A reader gets the read-only renderer, not a disabled editor:
              // it's the same markup the public share view paints, and — the
              // point of it — the text can actually be selected, which is where
              // commenting starts. `doc-page-read` is what keeps the block
              // rhythm the same as the author's, so both see one document.
              <RichText html={page.content} className="doc-page-read" />
            )}
          </div>
          {prompt && <SelectionCommentButton prompt={prompt} onPick={startComment} />}
        </div>
      </div>

      <DocLinkDialog
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        linkedIds={links.map((l) => l.refId)}
        onPick={addLink}
        pending={update.isPending}
      />

      <DocVersionHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        page={page}
        canWrite={canWrite}
        onRestored={(restored) => {
          // The server has already written this body, so anything the debounce
          // was still holding is stale — dropping it is what makes the restore
          // stick instead of being overwritten a second later.
          pending.current = {};
          if (timer.current) clearTimeout(timer.current);
          setStatus('idle');
          setTitle(restored.title);
          if (collab) {
            // A remount would show the restored text to *this* window only, and
            // the next keystroke would mirror the old body back over it. Asking
            // the sync server to re-read the page applies it to the shared
            // document instead, so it lands on every open copy at once — nothing
            // to seed here, and no key to bump.
            void resetCollabDoc(page.id);
          } else {
            setSeed((s) => ({ nonce: s.nonce + 1, html: restored.content }));
          }
        }}
      />

      {canWrite && (
        <DocPageStyles
          open={stylesOpen}
          onClose={() => setStylesOpen(false)}
          style={style}
          onChange={changeStyle}
          // Nothing to apply it to on a one-page doc, so the action isn't offered.
          onApplyToAll={otherPages.length > 0 ? applyTypographyToAll : undefined}
        />
      )}
      </div>

      {/* One toggle, two shapes: docked beside the page where there's room for
          both, a sheet over it where there isn't. */}
      {rail && commentsOpen && wide && (
        <aside className="flex w-[340px] shrink-0 flex-col border-l bg-muted/10">{rail}</aside>
      )}
      {rail && !wide && (
        <Drawer
          open={commentsOpen}
          onClose={() => openComments(false)}
          title={t('docs.comments.title')}
          widthClassName="sm:max-w-md"
        >
          <div className="flex min-h-0 flex-1 flex-col">{rail}</div>
        </Drawer>
      )}
    </div>
  );
}

/**
 * Whether the comments rail has room to dock. The page needs the whole width on
 * a phone, so below this the same panel opens as a sheet instead.
 */
function useWideEnough(query = '(min-width: 1024px)') {
  const [wide, setWide] = useState(
    () => typeof window === 'undefined' || window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setWide(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return wide;
}

/** The autosave indicator — the only feedback there is, since there's no button. */
function SaveStatus({ status }: { status: SaveState }) {
  if (status === 'idle') return null;
  if (status === 'saving')
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="size-3 animate-spin" aria-hidden /> {t('docs.saving')}
      </span>
    );
  if (status === 'saved')
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <Check className="size-3" aria-hidden /> {t('docs.saved')}
      </span>
    );
  return <span className="inline-flex items-center gap-1">{t('docs.unsaved')}</span>;
}
