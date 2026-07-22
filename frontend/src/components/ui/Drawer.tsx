import { type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the panel (visually hidden; the body carries the heading). */
  title?: string;
  /** Actions rendered in the header row, left of the close button — e.g. an
   *  "open full page" link. */
  headerActions?: ReactNode;
  children: ReactNode;
  /** Width cap on ≥sm; full-width below it. Defaults to a comfortable reading size. */
  widthClassName?: string;
  className?: string;
}

/**
 * A right-anchored slide-over ("peek") panel, backed by the same Radix Dialog as
 * {@link Dialog} (portal, focus trap, scroll lock, Esc/overlay to close) but
 * pinned full-height to the right edge and sliding in from it. Used to preview an
 * issue in place — e.g. clicking a sub-task opens its detail here instead of
 * navigating away. Full-width on mobile, capped on desktop.
 */
export function Drawer({
  open,
  onClose,
  title,
  headerActions,
  children,
  widthClassName = 'sm:max-w-2xl',
  className,
}: DrawerProps) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l bg-background shadow-xl outline-none',
            'duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
            widthClassName,
            className,
          )}
        >
          <DialogPrimitive.Title className="sr-only">{title ?? 'Detail'}</DialogPrimitive.Title>
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <div className="flex min-w-0 items-center gap-1">{headerActions}</div>
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close"
                className="size-7 shrink-0 text-muted-foreground"
              >
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
