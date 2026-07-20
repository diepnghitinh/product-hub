import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CenteredPageLayoutProps {
  children: ReactNode;
  /** Extra classes on the centred column. */
  className?: string;
}

/**
 * The default page shape: a centred 1200px column that scrolls inside the
 * shell. Use for lists, detail pages and settings — anything that reads as a
 * document.
 */
export function CenteredPageLayout({ children, className }: CenteredPageLayoutProps) {
  return (
    <div className="min-w-0 flex-1 sm:overflow-y-auto">
      <div className={cn('mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8', className)}>
        {children}
      </div>
    </div>
  );
}
