import { useState, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

/** Square ghost icon button, matching the workspace topbar's close/menu buttons
 * (28px box, 16px icon — `Button` already forces `svg` to `size-4`). */
const HEADER_BTN = 'size-7 shrink-0 text-muted-foreground';

/** Per-feature maximized state, e.g. `ph_dialog_full:roadmap-item`. */
const FULL_KEY_PREFIX = 'ph_dialog_full:';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Plain text, or a node for a custom heading (e.g. an inline-editable title). */
  title?: ReactNode;
  /** Accessible dialog name. Required when `title` is a node rather than text. */
  titleLabel?: string;
  /**
   * Shows a maximize/restore toggle beside the close button, and remembers the
   * choice per feature (e.g. 'roadmap-item') so the dialog reopens as it was
   * left. Each feature gets its own slot.
   */
  fullscreenKey?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Simple controlled dialog with the original {open, onClose, title, footer} API,
 * now backed by Radix (portal, focus trap, scroll lock, Esc/overlay to close).
 */
export function Dialog({
  open,
  onClose,
  title,
  titleLabel,
  fullscreenKey,
  children,
  footer,
  className,
}: DialogProps) {
  const [full, setFull] = useState<boolean>(
    () => !!fullscreenKey && localStorage.getItem(FULL_KEY_PREFIX + fullscreenKey) === '1',
  );

  function toggleFull() {
    const next = !full;
    setFull(next);
    if (fullscreenKey) localStorage.setItem(FULL_KEY_PREFIX + fullscreenKey, next ? '1' : '0');
  }

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-0 z-50 m-auto grid h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg grid-rows-[auto_1fr_auto] overflow-hidden rounded-lg border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            className,
            // Maximized last, so it overrides the caller's size classes.
            full && 'h-[calc(100dvh-1rem)] max-h-none w-[calc(100%-1rem)] max-w-none',
          )}
        >
          {title ? (
            <div className="flex items-center justify-between gap-4 border-b px-6 py-4">
              {typeof title === 'string' ? (
                <DialogPrimitive.Title className="text-base font-semibold leading-none tracking-tight">
                  {title}
                </DialogPrimitive.Title>
              ) : (
                <>
                  {/* A node heading carries its own markup, so the accessible
                      name lives in a visually hidden Title instead. */}
                  <DialogPrimitive.Title className="sr-only">
                    {titleLabel ?? 'Dialog'}
                  </DialogPrimitive.Title>
                  <div className="min-w-0 flex-1">{title}</div>
                </>
              )}
              <div className="flex shrink-0 items-center gap-1">
                {fullscreenKey && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={toggleFull}
                    aria-label={full ? 'Restore' : 'Maximize'}
                    aria-pressed={full}
                    className={HEADER_BTN}
                  >
                    {full ? <Minimize2 /> : <Maximize2 />}
                  </Button>
                )}
                <DialogPrimitive.Close asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Close" className={HEADER_BTN}>
                    <X />
                  </Button>
                </DialogPrimitive.Close>
              </div>
            </div>
          ) : (
            <DialogPrimitive.Title className="sr-only">Dialog</DialogPrimitive.Title>
          )}
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t px-6 py-4">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
