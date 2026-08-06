import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

export interface LightboxItem {
  /** A file to show, by URL. */
  src?: string;
  /**
   * A drawn diagram to show instead — inline SVG, which has no URL to point at.
   * The node is a *clone*: the viewer owns it, and the original stays on the page
   * untouched while it's open. Diagram entries get pan/zoom (see below).
   */
  svg?: SVGElement;
  alt?: string;
}

interface LightboxState {
  items: LightboxItem[];
  index: number;
}

/** How far one zoom step goes, and how far zooming can go in either direction. */
const STEP = 1.4;
const MIN_SCALE = 0.5;
const MAX_SCALE = 8;
/** Past this much pointer travel a press is a pan, not a click — so it can't close. */
const DRAG_SLOP = 4;

/** Zoom level and offset. `scale: 1` is "fits the screen", which is where it opens. */
interface View {
  scale: number;
  x: number;
  y: number;
}
const FIT: View = { scale: 1, x: 0, y: 0 };

/**
 * Imperative viewer for one figure at a time. Call `open(items, index)` to show a
 * frameless dark overlay with the figure centered; more than one entry gets
 * prev/next arrows, a counter, and ←/→ keys. Built on the Radix Dialog primitive,
 * so it inherits a focus trap, scroll lock, Esc-to-close, and a portal to <body> —
 * the last of which keeps it in app scope, clear of the `.report-workspace` token
 * shadowing.
 *
 * An entry is either an image (`src`) or a drawn diagram (`svg`). A diagram is the
 * reason this goes beyond "bigger": a flowchart drawn at the width of a paragraph
 * column has labels too small to read, so diagram entries can be zoomed past fit
 * and panned around — wheel/pinch, drag, +/−/0, or the controls.
 *
 * Returns the overlay `node` to render in your tree (null while closed), so a
 * caller owns exactly one instance and no global host is needed. Shared by the
 * read-only `RichText` renderer, the editor's hover zoom, and comment attachments.
 */
export function useLightbox() {
  const [state, setState] = useState<LightboxState | null>(null);

  const open = useCallback((items: LightboxItem[], index = 0) => {
    const list = items.filter((i) => i.src || i.svg);
    if (list.length === 0) return;
    setState({ items: list, index: Math.min(Math.max(index, 0), list.length - 1) });
  }, []);

  const close = useCallback(() => setState(null), []);

  const node = state ? (
    <LightboxOverlay
      state={state}
      onIndex={(index) => setState((s) => (s ? { ...s, index } : s))}
      onClose={close}
    />
  ) : null;

  return { open, close, node };
}

/**
 * Every image inside `root`, in document order, as viewer entries — plus a way to
 * look up where a given one sits in that list. Shared so "click an image" and
 * "zoom this image" both open the *same* gallery: the reader can always arrow
 * through the rest of the block from wherever they started.
 */
export function collectImages(root: HTMLElement) {
  const nodes = Array.from(root.querySelectorAll('img')).filter(
    (n) => n.currentSrc || n.getAttribute('src'),
  );
  const items: LightboxItem[] = nodes.map((n) => ({
    src: n.currentSrc || n.src,
    alt: n.getAttribute('alt') || undefined,
  }));
  return { items, indexOf: (img: HTMLImageElement) => Math.max(0, nodes.indexOf(img)) };
}

/**
 * One drawn diagram as a viewer entry.
 *
 * Deliberately *not* part of the image gallery: a diagram is inline SVG with no
 * URL, and arrowing from a screenshot into a flowchart isn't a sequence anyone
 * asked for. It opens on its own.
 *
 * The node is cloned rather than moved, so the page keeps its picture — and the
 * copy is a snapshot, which is what makes it safe to hold in state while the
 * editor redraws the original underneath.
 */
export function collectDiagram(svg: SVGElement, alt?: string): LightboxItem[] {
  const copy = svg.cloneNode(true) as SVGElement;
  isolateIds(copy, `lb${clones++}`);
  return [{ svg: copy, alt }];
}

let clones = 0;

/**
 * Rename every id inside a cloned SVG and repoint everything that referred to it.
 *
 * A clone carries the original's ids, and `url(#arrowhead)` resolves against the
 * whole document — so the copy quietly borrows the page's markers and gradients
 * instead of using its own. It looks right until the page redraws the original
 * out from under it, at which point the arrowheads vanish from a picture that is
 * still on screen. Renaming makes the copy stand on its own.
 *
 * Mermaid also ships a `<style>` block inside the SVG whose rules are scoped by
 * root id, so that text gets the same treatment — miss it and the diagram opens
 * unstyled.
 */
function isolateIds(root: SVGElement, suffix: string) {
  const named = [root, ...Array.from(root.querySelectorAll<Element>('[id]'))].filter((el) => el.id);
  if (named.length === 0) return;

  const renamed = new Map<string, string>();
  for (const el of named) {
    renamed.set(el.id, `${el.id}-${suffix}`);
    el.id = `${el.id}-${suffix}`;
  }
  // Longest first, so `#a` can't claim the front of `#ab`.
  const alternatives = [...renamed.keys()]
    .sort((a, b) => b.length - a.length)
    .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const pattern = new RegExp(`#(${alternatives})\\b`, 'g');
  const swap = (text: string) => text.replace(pattern, (_, id: string) => `#${renamed.get(id)}`);

  for (const el of [root, ...Array.from(root.querySelectorAll<Element>('*'))]) {
    if (el.tagName.toLowerCase() === 'style') {
      el.textContent = swap(el.textContent ?? '');
      continue;
    }
    // Only attributes that could name one — `url(#…)`, `href="#…"`, `xlink:href`.
    // An `id` attribute has already been rewritten and holds no `#`.
    for (const attr of Array.from(el.attributes)) {
      if (attr.value.includes('#')) el.setAttribute(attr.name, swap(attr.value));
    }
  }
}

function LightboxOverlay({
  state,
  onIndex,
  onClose,
}: {
  state: LightboxState;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const { items, index } = state;
  const count = items.length;
  const many = count > 1;
  const current = items[index];
  const diagram = current.svg;

  /**
   * Where focus — and the caret — was when the viewer opened, captured during
   * this first render, before Radix's focus scope moves it away.
   *
   * A modal Radix dialog deliberately hands focus back to its *trigger* on close,
   * and a viewer opened imperatively has none, so focus would land on `<body>`:
   * zoom an image while writing and the next keystroke goes nowhere. Restoring the
   * range as well as the element is what makes a contenteditable resume mid-word.
   */
  // `undefined` = not captured yet; `null` = nothing worth restoring. Anything
  // else and a re-render would re-read focus, which by then is the viewer's own.
  const restore = useRef<{ el: HTMLElement; range: Range | null } | null | undefined>(undefined);
  if (restore.current === undefined) {
    const el = document.activeElement as HTMLElement | null;
    const selection = window.getSelection();
    const inside =
      selection && selection.rangeCount > 0 && el?.contains?.(selection.anchorNode as Node);
    restore.current =
      el && el !== document.body
        ? { el, range: inside ? selection.getRangeAt(0).cloneRange() : null }
        : null;
  }

  const go = useCallback(
    (delta: number) => onIndex((index + delta + count) % count),
    [index, count, onIndex],
  );

  // Arrow-key navigation (Esc is handled by the Radix dialog).
  useEffect(() => {
    if (!many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [many, go]);

  // ── Pan and zoom, for diagram entries only ───────────────────────────────
  // An image arrives at whatever resolution it was uploaded at and fitting it to
  // the screen is already the answer. A diagram is drawn at the width of the
  // column it sat in, so "see it bigger" is the whole reason for opening it.
  const [view, setView] = useState<View>(FIT);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // A press that travelled is a pan, and the click it ends with must not close
  // the viewer. Refs, because the click handler reads this in the same tick.
  const dragRef = useRef<{ x: number; y: number; from: View } | null>(null);
  const movedRef = useRef(false);
  const [panning, setPanning] = useState(false);

  const fit = useCallback(() => setView(FIT), []);

  /**
   * Zoom by `factor`, keeping whatever sits under `at` (viewport coordinates)
   * exactly where it is. Without that anchor the picture slides out from under
   * the pointer and the zoom is spent hunting for the part you were reading.
   *
   * Expressed as a factor rather than a target so the wheel handler — bound once,
   * natively — never has to read the current scale out of a stale closure.
   */
  const zoomBy = useCallback((factor: number, at?: { x: number; y: number }) => {
    const box = contentRef.current?.getBoundingClientRect();
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      if (scale === v.scale) return v;
      if (scale <= 1) return { scale, x: 0, y: 0 }; // back at fit, so back to centred
      if (!box || !at) return { ...v, scale };
      // The transform is translate(x, y) then scale about the layer's centre, so
      // the content point under the pointer is (at − centre − offset) / scale.
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      return {
        scale,
        x: at.x - cx - ((at.x - cx - v.x) / v.scale) * scale,
        y: at.y - cy - ((at.y - cy - v.y) / v.scale) * scale,
      };
    });
  }, []);

  // Wheel, and trackpad pinch (which arrives as ctrl+wheel). Bound natively so it
  // can be non-passive: React's own wheel listener can't call preventDefault, and
  // without that the page behind the overlay scrolls while you zoom.
  const onWheel = useCallback(
    (e: WheelEvent) => {
      if (!diagram) return;
      e.preventDefault();
      // A trackpad reports far finer deltas than a mouse wheel; damp them so one
      // pinch doesn't cross the whole zoom range.
      zoomBy(Math.exp(-e.deltaY / (e.ctrlKey ? 100 : 300)), { x: e.clientX, y: e.clientY });
    },
    [diagram, zoomBy],
  );

  /**
   * Holds the content node, and binds the wheel listener to it.
   *
   * A callback ref rather than an effect reading `contentRef.current`: Radix
   * mounts the content through `Presence`, so that effect can run while the node
   * is still null — and with nothing in its dep list that ever changes again, it
   * would then never bind at all, leaving zoom-by-wheel quietly dead. This runs
   * the moment the node exists, and again with null when it goes.
   */
  const setContent = useCallback(
    (el: HTMLDivElement | null) => {
      contentRef.current?.removeEventListener('wheel', onWheel);
      contentRef.current = el;
      el?.addEventListener('wheel', onWheel, { passive: false });
    },
    [onWheel],
  );

  // +/−/0 while the viewer is up — the shortcuts people try first.
  useEffect(() => {
    if (!diagram) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') zoomBy(STEP);
      else if (e.key === '-' || e.key === '_') zoomBy(1 / STEP);
      else if (e.key === '0') fit();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [diagram, zoomBy, fit]);

  // A different entry is a different picture — don't inherit the last one's zoom.
  useEffect(() => setView(FIT), [index]);

  const chrome =
    'grid place-items-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60';
  /** The chrome sits on the backdrop, which closes on click — keep it to itself. */
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        {/* The content layer fills the screen and is transparent; clicking it
            (the backdrop around the figure) closes the viewer, while clicks on
            the image or the chrome stop there. For a diagram it is also the pan
            surface — the whole screen, not just the picture — so a press that
            travelled is swallowed instead of closing. */}
        <DialogPrimitive.Content
          ref={setContent}
          aria-describedby={undefined}
          onClick={() => {
            if (movedRef.current) return;
            onClose();
          }}
          onPointerDown={(e) => {
            if (!diagram || e.button !== 0) return;
            dragRef.current = { x: e.clientX, y: e.clientY, from: view };
            movedRef.current = false;
          }}
          onPointerMove={(e) => {
            const start = dragRef.current;
            if (!start) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            if (!movedRef.current && Math.hypot(dx, dy) < DRAG_SLOP) return;
            movedRef.current = true;
            setPanning(true);
            setView({ scale: start.from.scale, x: start.from.x + dx, y: start.from.y + dy });
          }}
          onPointerUp={() => {
            dragRef.current = null;
            setPanning(false);
          }}
          onPointerCancel={() => {
            dragRef.current = null;
            setPanning(false);
            movedRef.current = false;
          }}
          onCloseAutoFocus={(e) => {
            const saved = restore.current;
            if (!saved?.el.isConnected) return; // nothing to go back to
            // Radix's own handler is skipped once this one prevents the default.
            e.preventDefault();
            saved.el.focus({ preventScroll: true });
            if (!saved.range) return;
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(saved.range);
          }}
          className={cn(
            'fixed inset-0 z-[60] flex items-center justify-center p-4 focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:p-10',
            // `touch-none` so a one-finger drag pans the diagram instead of
            // scrolling the page behind it.
            diagram && 'touch-none',
            diagram && (panning ? 'cursor-grabbing' : 'cursor-grab'),
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {current.alt || t(diagram ? 'editor.blockDiagram' : 'lightbox.title')}
          </DialogPrimitive.Title>

          {diagram ? (
            <DiagramLayer svg={diagram} view={view} panning={panning} />
          ) : (
            <img
              src={current.src}
              alt={current.alt || ''}
              onClick={stop}
              className="max-h-full max-w-full select-none rounded-md object-contain shadow-2xl"
            />
          )}

          <button
            type="button"
            aria-label={t('lightbox.close')}
            onClick={onClose}
            className={`fixed right-3 top-3 size-10 sm:right-5 sm:top-5 ${chrome}`}
          >
            <X className="size-5" />
          </button>

          {diagram && (
            <div
              onClick={stop}
              onPointerDown={stop}
              className="fixed bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/10 p-1 backdrop-blur"
            >
              <button
                type="button"
                aria-label={t('lightbox.zoomOut')}
                title={t('lightbox.zoomOut')}
                disabled={view.scale <= MIN_SCALE}
                onClick={() => zoomBy(1 / STEP)}
                className={`size-8 disabled:opacity-40 ${chrome}`}
              >
                <Minus className="size-4" />
              </button>
              {/* The readout doubles as the reset: the number says how far you've
                  gone, and clicking it is how you come back. */}
              <button
                type="button"
                title={t('lightbox.zoomFit')}
                onClick={fit}
                className="min-w-16 rounded-full px-2 py-1 text-xs font-medium tabular-nums text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                {view.scale === 1 ? t('lightbox.zoomFit') : `${Math.round(view.scale * 100)}%`}
              </button>
              <button
                type="button"
                aria-label={t('lightbox.zoomIn')}
                title={t('lightbox.zoomIn')}
                disabled={view.scale >= MAX_SCALE}
                onClick={() => zoomBy(STEP)}
                className={`size-8 disabled:opacity-40 ${chrome}`}
              >
                <Plus className="size-4" />
              </button>
            </div>
          )}

          {many && (
            <>
              <button
                type="button"
                aria-label={t('lightbox.prev')}
                onClick={(e) => {
                  e.stopPropagation();
                  go(-1);
                }}
                className={`fixed left-3 top-1/2 size-11 -translate-y-1/2 sm:left-5 ${chrome}`}
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                aria-label={t('lightbox.next')}
                onClick={(e) => {
                  e.stopPropagation();
                  go(1);
                }}
                className={`fixed right-3 top-1/2 size-11 -translate-y-1/2 sm:right-5 ${chrome}`}
              >
                <ChevronRight className="size-6" />
              </button>
              <div className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white backdrop-blur">
                {index + 1} / {count}
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * The diagram itself: the cloned SVG stretched over the whole content area, left
 * to fit inside it by its own `viewBox` — mermaid draws with `preserveAspectRatio`
 * so it centres and letterboxes without being measured.
 *
 * The layer is `pointer-events-none` on purpose. Covering the full area, it would
 * otherwise swallow every click in the letterbox margins, and the backdrop is how
 * the viewer is closed. Pan and zoom are handled a level up, on the backdrop, so
 * the gesture surface is the whole screen rather than just the picture.
 */
function DiagramLayer({ svg, view, panning }: { svg: SVGElement; view: View; panning: boolean }) {
  const mount = useCallback(
    (host: HTMLDivElement | null) => {
      if (!host) return;
      // Mermaid ships the SVG sized for the column it was drawn in — an inline
      // `max-width`, and usually width/height attributes. Clear those and the
      // viewBox takes over, which is what lets it grow to fill the screen while
      // `preserveAspectRatio` keeps it centred and undistorted.
      //
      // Without a viewBox there is no ratio to preserve, so stretching it to the
      // box would squash the drawing. Those diagrams stay at their own size and
      // simply sit in the middle — still bigger than they were in the column, and
      // still zoomable.
      if (svg.getAttribute('viewBox')) {
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.style.maxWidth = 'none';
        svg.style.width = '100%';
        svg.style.height = '100%';
      } else {
        svg.style.maxWidth = '100%';
        svg.style.maxHeight = '100%';
      }
      host.replaceChildren(svg);
    },
    [svg],
  );

  return (
    <div
      ref={mount}
      aria-hidden
      className="pointer-events-none absolute inset-4 grid select-none place-items-center sm:inset-10"
      style={{
        transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        // Eased for a button or a key press, instant while dragging — a drag sets
        // the offset every frame, where a transition would only add lag.
        transition: panning ? 'none' : 'transform 90ms ease-out',
      }}
    />
  );
}

export type LightboxNode = ReactNode;
