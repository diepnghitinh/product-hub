import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PAGE_SCROLLER } from './pageScroller';

export interface CenteredPageLayoutProps {
  children: ReactNode;
  /** Extra classes on the centred column. */
  className?: string;
}

/** The reading column: one definition of the 1200px cap and its gutter. */
const CENTERED_COLUMN = 'mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8';

/**
 * The default page shape: a centred 1200px column that scrolls inside the
 * shell. Use for lists, detail pages and settings — anything that reads as a
 * document.
 */
export function CenteredPageLayout({ children, className }: CenteredPageLayoutProps) {
  return (
    <div className={PAGE_SCROLLER}>
      <div className={cn(CENTERED_COLUMN, className)}>{children}</div>
    </div>
  );
}
