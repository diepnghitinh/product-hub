import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { enhanceCodeBlocks } from '@/lib/enhanceCodeBlocks';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { useLightbox, type LightboxImage } from './Lightbox';

/** Shared prose styling for editor HTML — links, images (click-to-zoom cursor). */
const PROSE =
  '[&_a]:cursor-pointer [&_a]:text-primary [&_a]:underline [&_img]:h-auto [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded-md';

/** Resolve an href against the current origin; null if it isn't a real URL. */
function resolve(href: string): URL | null {
  try {
    return new URL(href, window.location.href);
  } catch {
    return null;
  }
}

/** A web link we treat as "open in a new tab" (leaves mailto:/tel:/# alone). */
function isWebLink(url: URL | null): url is URL {
  return !!url && (url.protocol === 'http:' || url.protocol === 'https:');
}

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
  // The off-domain URL awaiting the user's confirmation (null = no prompt).
  const [pending, setPending] = useState<string | null>(null);

  // Decorate links (target/rel) and add code-copy buttons whenever the HTML
  // changes. Click behaviour itself is delegated on the container below.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    enhanceCodeBlocks(root);
    root.querySelectorAll('a[href]').forEach((a) => {
      if (isWebLink(resolve(a.getAttribute('href') || ''))) {
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

      // Link → new tab; off-domain links get a confirmation first. Same-origin
      // links fall through to the anchor's native target=_blank.
      const a = el.closest('a');
      if (a && root.contains(a)) {
        const url = resolve(a.getAttribute('href') || '');
        if (isWebLink(url) && url.hostname !== window.location.hostname) {
          e.preventDefault();
          setPending(url.href);
        }
      }
    },
    [lightbox],
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
      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={t('richText.externalTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (pending) window.open(pending, '_blank', 'noopener,noreferrer');
                setPending(null);
              }}
            >
              {t('richText.externalOpen')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">{t('richText.externalBody')}</p>
        <p className="mt-2 break-all rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground">
          {pending}
        </p>
      </Dialog>
    </>
  );
}
