import { useCallback, useState, type ReactNode } from 'react';
import { t } from '@/i18n';
import { Button } from './Button';
import { Dialog } from './Dialog';

/** Resolve an href against the current origin; null if it isn't a real URL. */
export function resolveHref(href: string): URL | null {
  try {
    return new URL(href, window.location.href);
  } catch {
    return null;
  }
}

/** A web link we treat as "open in a new tab" (leaves mailto:/tel:/# alone). */
export function isWebLink(url: URL | null): url is URL {
  return !!url && (url.protocol === 'http:' || url.protocol === 'https:');
}

export interface ExternalLinkGuard {
  /**
   * Take a click on a link. Same-origin opens straight in a new tab; anything
   * off-domain shows the URL and asks first. Returns false when the href isn't a
   * web link (mailto:, tel:, #) — the caller should let the browser have it.
   */
  open: (href: string) => boolean;
  /** The confirmation dialog. Render it in your tree (it portals to `<body>`). */
  node: ReactNode;
}

/**
 * The one place link-clicking is decided, so reading a description and editing it
 * behave identically: new tab, `noopener`, and an off-domain link names the site
 * it's about to send you to before it does.
 *
 * The prompt is the security part — rich text is written by other people, and the
 * text of a link is not evidence of where it goes. Same-origin links skip it:
 * inside this workspace there's nothing to warn about.
 *
 * Used by `RichText` (read view) and `RichTextEditor` (write view); pattern
 * mirrors `useLightbox()` — call it, render `node`, no global host.
 */
export function useExternalLink(): ExternalLinkGuard {
  // The off-domain URL awaiting the user's confirmation (null = no prompt).
  const [pending, setPending] = useState<string | null>(null);

  const open = useCallback((href: string) => {
    const url = resolveHref(href);
    if (!isWebLink(url)) return false;
    if (url.hostname === window.location.hostname) {
      window.open(url.href, '_blank', 'noopener,noreferrer');
    } else {
      setPending(url.href);
    }
    return true;
  }, []);

  const node = (
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
  );

  return { open, node };
}
