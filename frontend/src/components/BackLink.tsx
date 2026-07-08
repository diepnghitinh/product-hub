import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BackLinkProps {
  /** Destination route. */
  to: string;
  /** Label, e.g. the name of the page you're returning to. */
  children: ReactNode;
  className?: string;
}

/**
 * The single back-navigation affordance used across every page: a plain,
 * muted "← Label" link (no chrome) that lifts to the foreground colour on
 * hover, with a subtle arrow nudge. Kept identical everywhere.
 */
export function BackLink({ to, children, className }: BackLinkProps) {
  return (
    <div className={cn('mb-4', className)}>
      <Link
        to={to}
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft
          className="size-4 transition-transform group-hover:-translate-x-0.5"
          aria-hidden
        />
        {children}
      </Link>
    </div>
  );
}
