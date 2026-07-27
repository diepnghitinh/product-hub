import { useCallback, useEffect, useState, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { t } from '@/i18n';

export interface LightboxImage {
  src: string;
  alt?: string;
}

interface LightboxState {
  images: LightboxImage[];
  index: number;
}

/**
 * Imperative image viewer. Call `open(images, index)` to show a frameless dark
 * overlay with the picture centered; more than one image gets prev/next arrows,
 * a counter, and ←/→ keys. Built on the Radix Dialog primitive, so it inherits a
 * focus trap, scroll lock, Esc-to-close, and a portal to <body> — the last of
 * which keeps it in app scope, clear of the `.report-workspace` token shadowing.
 *
 * Returns the overlay `node` to render in your tree (null while closed), so a
 * caller owns exactly one instance and no global host is needed. Shared by the
 * read-only `RichText` renderer and by comment attachments.
 */
export function useLightbox() {
  const [state, setState] = useState<LightboxState | null>(null);

  const open = useCallback((images: LightboxImage[], index = 0) => {
    const list = images.filter((i) => i.src);
    if (list.length === 0) return;
    setState({ images: list, index: Math.min(Math.max(index, 0), list.length - 1) });
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

function LightboxOverlay({
  state,
  onIndex,
  onClose,
}: {
  state: LightboxState;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const { images, index } = state;
  const count = images.length;
  const many = count > 1;
  const current = images[index];

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

  const chrome =
    'grid place-items-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60';

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
            (the backdrop around the image) closes the viewer, while clicks on the
            image or the chrome stop there. */}
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onClick={onClose}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:p-10"
        >
          <DialogPrimitive.Title className="sr-only">
            {current.alt || t('lightbox.title')}
          </DialogPrimitive.Title>

          <img
            src={current.src}
            alt={current.alt || ''}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full select-none rounded-md object-contain shadow-2xl"
          />

          <button
            type="button"
            aria-label={t('lightbox.close')}
            onClick={onClose}
            className={`fixed right-3 top-3 size-10 sm:right-5 sm:top-5 ${chrome}`}
          >
            <X className="size-5" />
          </button>

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

export type LightboxNode = ReactNode;
