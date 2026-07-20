import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FullWidthPageLayoutProps {
  children: ReactNode;
  /**
   * Fill the shell exactly instead of scrolling: the page becomes a flex column
   * that clips, and whatever it renders manages its own scrolling. This is what
   * the boards use — columns scroll internally and the board scrolls
   * horizontally with the bar pinned near the bottom.
   */
  fullHeight?: boolean;
  className?: string;
}

/**
 * Edge-to-edge page: keeps the shell's padding but drops the 1200px cap, for
 * surfaces that need the width (the kanban boards, the inbox two-pane).
 */
export function FullWidthPageLayout({
  children,
  fullHeight,
  className,
}: FullWidthPageLayoutProps) {
  if (fullHeight) {
    return (
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col px-4 py-6 sm:min-h-0 md:px-8 md:py-8',
          className,
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1 sm:overflow-y-auto">
      <div className={cn('w-full px-4 py-6 md:px-8 md:py-8', className)}>{children}</div>
    </div>
  );
}
