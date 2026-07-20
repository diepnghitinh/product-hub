import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FullScreenLayoutProps {
  children: ReactNode;
  className?: string;
}

/**
 * No chrome at all: no cap, no padding, fills the shell. For surfaces that draw
 * their own frame edge-to-edge (the project workspace, the report view).
 */
export function FullScreenLayout({ children, className }: FullScreenLayoutProps) {
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col sm:min-h-0', className)}>{children}</div>
  );
}
