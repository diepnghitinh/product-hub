import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ZoomIn } from 'lucide-react';
import { t } from '@/i18n';
import { collectDiagram, collectImages, useLightbox } from './Lightbox';

/** Button box and how far it sits inside the figure's top-right corner. */
const BTN = 32;
const INSET = 6;
/** Anything smaller would be swallowed whole by the button — skip it. */
const MIN_SIZE = 48;

/**
 * What counts as a diagram: the SVG the editor's Mermaid block draws into
 * (`.mermaid-tool-preview`) or the one a stored block renders (`.mermaid-render`).
 * Never the source textarea, and never the message a broken diagram prints in the
 * picture's place — that isn't an SVG, so there is nothing to enlarge.
 */
const DIAGRAM = '.mermaid-tool-preview > svg, .mermaid-render > svg';

interface Spot {
  el: HTMLElement;
  /** Images open the document's gallery; a diagram opens on its own. */
  diagram: boolean;
  top: number;
  left: number;
}

/**
 * Hover-to-zoom for figures inside an *editable* surface — images and diagrams.
 *
 * The read view (`RichText`) can simply take the click on a figure, but inside a
 * contenteditable a click already means something else: put the caret here, select
 * this block, or — on a diagram — open its source for editing. So a picture you're
 * writing around has no way to be seen full size. This adds the missing
 * affordance: hover it, a magnifier appears over its corner, and clicking that
 * opens the same viewer the read view uses. An image is seeded with every image in
 * the surface, so ←/→ still walk the document; a diagram opens alone, and can be
 * zoomed and panned once it's there.
 *
 * The button is rendered through a portal to `<body>`, never into the editor's
 * DOM: markup injected inside a block would be saved back into the document's
 * HTML (and a table cell would keep it). Which also means it can't be clipped by
 * a scroll container and lands in app scope, clear of `.report-workspace` token
 * shadowing.
 *
 * Pass the container to watch; render the returned `node` in your tree.
 */
export function useFigureZoom(containerRef: { current: HTMLElement | null }) {
  const lightbox = useLightbox();
  const [spot, setSpot] = useState<Spot | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  // What the pointer is on *right now*, tracked outside React state so a queued
  // frame can tell whether it's still wanted — see the scroll effect below.
  const hoveredRef = useRef<{ el: HTMLElement; diagram: boolean } | null>(null);

  /** Pin the button to `el`'s top-right corner — or take it away (`null`). */
  const place = useCallback((el: HTMLElement | null, diagram = false) => {
    const r = el?.getBoundingClientRect();
    if (!el || !r || r.width < MIN_SIZE || r.height < MIN_SIZE) {
      hoveredRef.current = null;
      setSpot(null);
      return;
    }
    hoveredRef.current = { el, diagram };
    setSpot({ el, diagram, top: r.top + INSET, left: r.right - BTN - INSET });
  }, []);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // `pointerover` bubbles (unlike enter), so one listener covers every figure
    // the editor renders later — block images, diagrams drawn once the lazy
    // mermaid import lands, and the ones a `/` menu drops into a table cell.
    const onOver = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      // A diagram is checked first: `closest` from inside an SVG walks out
      // through the diagram before it could ever reach an <img>.
      const svg = target?.closest?.(DIAGRAM) as HTMLElement | null;
      if (svg && root.contains(svg)) {
        place(svg, true);
        return;
      }
      const img = target?.closest?.('img') as HTMLImageElement | null;
      place(img && root.contains(img) && (img.currentSrc || img.getAttribute('src')) ? img : null);
    };

    // Leaving the container hides the button — except when the pointer is landing
    // on the button itself, which sits over the figure and outside this subtree.
    const onLeave = (e: PointerEvent) => {
      const to = e.relatedTarget as Node | null;
      if (to && btnRef.current?.contains(to)) return;
      place(null);
    };

    // A resize drag moves the corner the button is pinned to; get out of the way.
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('.rte-image__handle')) place(null);
    };

    root.addEventListener('pointerover', onOver);
    root.addEventListener('pointerleave', onLeave);
    root.addEventListener('pointerdown', onDown);
    return () => {
      root.removeEventListener('pointerover', onOver);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('pointerdown', onDown);
    };
  }, [containerRef, place]);

  // Follow the figure while the page scrolls under the pointer. Subscribed on the
  // element rather than on `spot` — re-placing makes a new object every frame,
  // and depending on that would re-bind these listeners just as often.
  //
  // The frame re-reads `hoveredRef` instead of closing over the element: scrolling
  // a figure into view is itself what moves the pointer onto the *next* one, so a
  // frame queued a moment ago must not put the button back on the one just left.
  const hovered = spot?.el ?? null;
  useEffect(() => {
    if (!hovered) return;
    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const on = hoveredRef.current;
        if (on) place(on.el, on.diagram);
      });
    };
    window.addEventListener('scroll', sync, true);
    window.addEventListener('resize', sync);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', sync, true);
      window.removeEventListener('resize', sync);
    };
  }, [hovered, place]);

  const zoom = useCallback(() => {
    const root = containerRef.current;
    if (!root || !spot) return;
    if (spot.diagram) {
      lightbox.open(collectDiagram(spot.el as unknown as SVGElement, t('editor.blockDiagram')));
    } else {
      const { items, indexOf } = collectImages(root);
      lightbox.open(items, indexOf(spot.el as HTMLImageElement));
    }
    // The viewer takes over from here; drop the hover state so closing it doesn't
    // leave the button hanging over a figure the pointer has since left.
    place(null);
  }, [containerRef, lightbox, place, spot]);

  // `lightbox.node` is the open/closed flag: with the viewer up, the hover chrome
  // underneath it is both invisible and pointless.
  const button =
    spot && !lightbox.node
      ? createPortal(
          <button
            ref={btnRef}
            type="button"
            aria-label={t('editor.zoomImage')}
            title={t('editor.zoomImage')}
            style={{ top: spot.top, left: spot.left, width: BTN, height: BTN }}
            // Keep the caret where it was. Focus follows `mousedown`, so that is
            // the event to cancel — a button that takes focus pulls the selection
            // out of the block being written in, and the viewer then has nothing
            // to hand it back to when it closes (the next keystroke goes nowhere).
            // The click still fires; only the focus change is suppressed.
            onMouseDown={(e) => e.preventDefault()}
            onClick={zoom}
            onPointerLeave={(e) => {
              const to = e.relatedTarget as Node | null;
              if (to && containerRef.current?.contains(to)) return;
              place(null);
            }}
            className="fixed z-40 grid cursor-zoom-in place-items-center rounded-md bg-black/55 text-white shadow-sm backdrop-blur transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <ZoomIn className="size-4" />
          </button>,
          document.body,
        )
      : null;

  return {
    node: (
      <>
        {button}
        {lightbox.node}
      </>
    ),
  };
}
