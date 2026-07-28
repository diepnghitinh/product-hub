import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, History, Link2, Loader2, X } from 'lucide-react';
import { Button, RichTextEditor, SymbolPicker } from '@/components/ui';
import { MediaUploader } from '@/components/MediaUploader';
import { TeamSymbol, TEAM_SYMBOL_NAMES } from '@/components/TeamSymbol';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { timeAgo } from '@/lib/format';
import { DocLinkKind, IssueKind, TEAM_COLORS } from '@/types/enums';
import type { DocAttachment, DocLink, DocPageDto } from '@/types/dto';
import { useDoc, useUpdateDocPage } from '../api';
import { pageStyleOf, typographyAttrs, widthClass, type DocPageStyle } from '../pageStyle';
import { DocAttachments } from './DocAttachments';
import { DocLinkDialog } from './DocLinkDialog';
import { DocPageStyles } from './DocPageStyles';
import { DocVersionHistory } from './DocVersionHistory';

interface DocPageEditorProps {
  page: DocPageDto;
  canWrite: boolean;
  /** Page Styles opens from the doc's ⋯ menu, which lives a level up. */
  stylesOpen?: boolean;
  onStylesClose?: () => void;
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
  stylesOpen = false,
  onStylesClose,
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
  const [linkOpen, setLinkOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  /**
   * What the editor was mounted with. Editor.js reads its value once, so the
   * only way to put different text in front of the cursor — which is exactly
   * what restoring a version does — is to remount it under a fresh key.
   */
  const [seed, setSeed] = useState({ nonce: 0, html: page.content });

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
  // itself, so the button follows the switch.
  const showAddCover = canWrite && style.showCover && !coverUrl;
  // A band with a heading and nothing under it is worse than no band.
  const linksOn = style.showLinks && (canWrite || links.length > 0);
  const filesOn = style.showAttachments && (canWrite || files.length > 0);
  const typo = typographyAttrs(style);

  return (
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
        {/* Symbol and title share one line, so the icon reads as part of the
            heading rather than a row floating above it. "Add cover" rides the
            same line and stays out of the way until you hover — the same
            treatment the cover's own controls get above.
            Hidden, the title is still edited from the rail — this switch is
            about the page's own look, not about whether the page has a name. */}
        {style.showTitle ? (
          <div className="group flex items-center gap-2">
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
                  // The picker sends whichever half changed, so patch just that
                  // one — writing both would blank the other to its default.
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
            <input
              value={title}
              readOnly={!canWrite}
              onChange={(e) => {
                setTitle(e.target.value);
                queue({ title: e.target.value });
              }}
              onBlur={() => void flush()}
              aria-label={t('docs.pageTitle')}
              placeholder={t('docs.untitled')}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/60 sm:text-3xl"
            />
            {showAddCover && (
              <MediaUploader
                accept="image/*"
                multiple={false}
                variant="ghost"
                label={t('docs.addCover')}
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
                onUploaded={(m) => {
                  setCoverUrl(m.url);
                  saveNow({ coverUrl: m.url });
                }}
              />
            )}
          </div>
        ) : (
          // No title to hang it on, so the cover button keeps a line of its own.
          showAddCover && (
            <div className="flex items-center gap-2">
              <MediaUploader
                accept="image/*"
                multiple={false}
                variant="ghost"
                label={t('docs.addCover')}
                className="text-muted-foreground"
                onUploaded={(m) => {
                  setCoverUrl(m.url);
                  saveNow({ coverUrl: m.url });
                }}
              />
            </div>
          )
        )}

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
              {canWrite && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 text-xs text-muted-foreground"
                  onClick={() => setLinkOpen(true)}
                >
                  <Link2 className="size-3.5" /> {t('docs.linkRecord')}
                </Button>
              )}
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

        <div className={cn('mt-4', !canWrite && 'pointer-events-none opacity-90')}>
          <RichTextEditor
            key={seed.nonce}
            value={seed.html}
            images
            diagrams
            minHeight={360}
            placeholder={t('docs.write')}
            onChange={(html) => queue({ content: html })}
            // A doc page *is* the document — the skin drops the frame + focus
            // ring and reads at body size (see rich-text-editor.css).
            className="doc-page"
          />
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
          setSeed((s) => ({ nonce: s.nonce + 1, html: restored.content }));
        }}
      />

      {canWrite && (
        <DocPageStyles
          open={stylesOpen}
          onClose={() => onStylesClose?.()}
          style={style}
          onChange={changeStyle}
          // Nothing to apply it to on a one-page doc, so the action isn't offered.
          onApplyToAll={otherPages.length > 0 ? applyTypographyToAll : undefined}
        />
      )}
    </div>
  );
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
