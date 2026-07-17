import type { ReactNode } from 'react';
import { Input } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';

export interface IssueViewOption {
  value: string;
  label: string;
}

interface IssueBoardLayoutProps {
  title: string;
  subtitle?: string;
  /** Optional back link rendered above the header (e.g. bugs scoped to a project). */
  backLink?: ReactNode;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  };
  /** The FilterMenu. */
  filters?: ReactNode;
  /** Board/List switch — rendered by the layout so every team looks identical. */
  view?: {
    value: string;
    onChange: (value: string) => void;
    options: IssueViewOption[];
  };
  /** Primary action (e.g. "+ New bug"). */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * The shared shell for every team's issue list — QC (bugs) and Engineering
 * (tasks) render through this, so both get the same header, the same toolbar
 * row (search · filters ······ view · action) and the same full-height content
 * area. Previously each board built its own chrome and they drifted apart.
 */
export function IssueBoardLayout({
  title,
  subtitle,
  backLink,
  search,
  filters,
  view,
  actions,
  children,
}: IssueBoardLayoutProps) {
  const hasToolbar = !!(search || filters || view || actions);

  return (
    <div className="flex flex-col sm:h-full">
      {backLink}
      <PageHeader title={title} subtitle={subtitle} />

      {hasToolbar && (
        <div className="mb-6 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
          {search && (
            <Input
              className="sm:max-w-[280px]"
              placeholder={search.placeholder}
              aria-label={search.placeholder}
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
            />
          )}
          {filters}
          <div className="flex items-center gap-2 sm:ml-auto">
            {view && (
              <div className="inline-flex rounded-md border p-0.5">
                {view.options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={view.value === o.value}
                    className={cn(
                      'rounded px-3 py-1 text-sm transition-colors',
                      view.value === o.value
                        ? 'bg-accent font-medium text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => view.onChange(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            {actions}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
