import { useCallback, useEffect, useRef, type MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import { enhanceCodeBlocks } from '@/lib/enhanceCodeBlocks';
import { renderMermaidBlocks } from '@/lib/mermaid';
// The read-only view paints editor output — code-copy buttons and mermaid
// diagrams both need these rules, on pages that never mount the editor itself.
import '@/styles/rich-text-editor.css';
import { isWebLink, resolveHref, useExternalLink } from './ExternalLink';
import { useLightbox, type LightboxImage } from './Lightbox';

/** Shared prose styling for editor HTML — links, images (click-to-zoom cursor). */
const PROSE =
  '[&_a]:cursor-pointer [&_a]:text-primary [&_a]:underline [&_img]:h-auto [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded-md';

export interface RichTextProps {
  /** Stored rich-text value as HTML (what the editor emits). */
  html: string;
  className?: string;
}

/**
 * Read-only renderer for the HTML our `RichTextEditor` produces. Beyond painting
 * the markup it makes the content behave the way a reader expects, and does so in
 * one place so every description/detail surface reads identically:
 *  · links open in a new tab (`rel=noopener`); off-domain links ask first;
 *  · embedded images open in a lightbox — click any image, arrow through the rest;
 *  · code blocks get the same hover "copy" button as the editor.
 *
 * Drop-in for the old `<div className="[&_a]… [&_img]…" dangerouslySetInnerHTML>`
 * blocks; pass surface-specific type styles (e.g. `text-sm text-muted-foreground`)
 * via `className`.
 */
export function RichText({ html, className }: RichTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lightbox = useLightbox();
  const links = useExternalLink();

  // Decorate links (target/rel) and add code-copy buttons whenever the HTML
  // changes. Click behaviour itself is delegated on the container below.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    enhanceCodeBlocks(root);
    // Diagrams are stored as source, so the picture only exists once it's drawn.
    // Fire-and-forget: mermaid loads lazily and a failure prints in its own box.
    void renderMermaidBlocks(root);
    root.querySelectorAll('a[href]').forEach((a) => {
      if (isWebLink(resolveHref(a.getAttribute('href') || ''))) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }, [html]);

  const onClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const root = ref.current;
      if (!root) return;
      const el = e.target as HTMLElement;

      // Image → open the lightbox, seeded with every image in this block so the
      // reader can arrow through them from wherever they clicked.
      const img = el.closest('img');
      if (img && root.contains(img)) {
        const all = Array.from(root.querySelectorAll('img')).filter(
          (n) => n.currentSrc || n.getAttribute('src'),
        );
        const images: LightboxImage[] = all.map((n) => ({
          src: n.currentSrc || n.src,
          alt: n.getAttribute('alt') || undefined,
        }));
        e.preventDefault();
        lightbox.open(images, Math.max(0, all.indexOf(img as HTMLImageElement)));
        return;
      }

      // Link → new tab, off-domain ones after a confirmation. The guard opens it,
      // so stop the anchor from opening a second copy of the same tab.
      const a = el.closest('a');
      if (a && root.contains(a) && links.open(a.getAttribute('href') || '')) {
        e.preventDefault();
      }
    },
    [lightbox, links],
  );

  return (
    <>
      <div
        ref={ref}
        className={cn(PROSE, className)}
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {lightbox.node}
      {links.node}
    </>
  );
}
