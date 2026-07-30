import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ZoomIn } from 'lucide-react';
import { t } from '@/i18n';
import { collectImages, useLightbox } from './Lightbox';

/** Button box and how far it sits inside the image's top-right corner. */
const BTN = 32;
const INSET = 6;
/** Anything smaller would be swallowed whole by the button — skip it. */
const MIN_SIZE = 48;

interface Spot {
  el: HTMLImageElement;
  top: number;
  left: number;
}

/**
 * Hover-to-zoom for images inside an *editable* surface.
 *
 * The read view (`RichText`) can simply take the click on an image, but inside a
 * contenteditable a click means "put the caret here / select this block" — so a
 * picture you're writing around has no way to be seen full size. This adds the
 * missing affordance: hover an image, a magnifier appears over its corner, and
 * clicking it opens the same lightbox the read view uses, seeded with every image
 * in the surface so ←/→ still walk the document.
 *
 * The button is rendered through a portal to `<body>`, never into the editor's
 * DOM: markup injected inside a block would be saved back into the document's
 * HTML (and a table cell would keep it). Which also means it can't be clipped by
 * a scroll container and lands in app scope, clear of `.report-workspace` token
 * shadowing.
 *
 * Pass the container to watch; render the returned `node` in your tree.
 */
export function useImageZoom(containerRef: { current: HTMLElement | null }) {
  const lightbox = useLightbox();
  const [spot, setSpot] = useState<Spot | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  // What the pointer is on *right now*, tracked outside React state so a queued
  // frame can tell whether it's still wanted — see the scroll effect below.
  const hoveredRef = useRef<HTMLImageElement | null>(null);

  /** Pin the button to `el`'s top-right corner — or take it away (`null`). */
  const place = useCallback((el: HTMLImageElement | null) => {
    const r = el?.getBoundingClientRect();
    if (!el || !r || r.width < MIN_SIZE || r.height < MIN_SIZE) {
      hoveredRef.current = null;
      setSpot(null);
      return;
    }
    hoveredRef.current = el;
    setSpot({ el, top: r.top + INSET, left: r.right - BTN - INSET });
  }, []);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // `pointerover` bubbles (unlike enter), so one listener covers every image
    // the editor renders later — block images and the ones a `/` menu drops into
    // a table cell alike.
    const onOver = (e: PointerEvent) => {
      const img = (e.target as HTMLElement | null)?.closest?.('img') as HTMLImageElement | null;
      place(img && root.contains(img) && (img.currentSrc || img.getAttribute('src')) ? img : null);
    };

    // Leaving the container hides the button — except when the pointer is landing
    // on the button itself, which sits over the image and outside this subtree.
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

  // Follow the image while the page scrolls under the pointer. Subscribed on the
  // element rather than on `spot` — re-placing makes a new object every frame,
  // and depending on that would re-bind these listeners just as often.
  //
  // The frame re-reads `hoveredRef` instead of closing over the element: scrolling
  // an image into view is itself what moves the pointer onto the *next* one, so a
  // frame queued a moment ago must not put the button back on the one just left.
  const hovered = spot?.el ?? null;
  useEffect(() => {
    if (!hovered) return;
    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (hoveredRef.current) place(hoveredRef.current);
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
    const { images, indexOf } = collectImages(root);
    lightbox.open(images, indexOf(spot.el));
    // The viewer takes over from here; drop the hover state so closing it doesn't
    // leave the button hanging over an image the pointer has since left.
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
