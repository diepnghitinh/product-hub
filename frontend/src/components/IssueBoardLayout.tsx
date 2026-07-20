import type { ReactNode } from 'react';
import { Input } from '@/components/ui';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { FullScreenLayout } from '@/layouts/shared';

/** Inset shared by the toolbar and any non-board view, matching the topbar. */
export const BOARD_GUTTER = 'px-4 md:px-8';
import { cn } from '@/lib/utils';

export interface IssueViewOption {
  value: string;
  label: string;
}

interface IssueBoardLayoutProps {
  title: string;
  subtitle?: string;
  /** Rendered beside the title — the team's symbol on a team board. */
  titleIcon?: ReactNode;
  /** Optional back link rendered above the header (e.g. bugs scoped to a project). */
  backLink?: ReactNode;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  };
  /** The FilterMenu. */
  filters?: ReactNode;
  /** Board/List switch — rendered by the layout so every board looks identical. */
  view?: {
    value: string;
    onChange: (value: string) => void;
    options: IssueViewOption[];
  };
  /** Primary action (e.g. "+ New bug"). */
  actions?: ReactNode;
  /** Makes the title editable in the topbar (see `PageHeader`). */
  onTitleChange?: (title: string) => void;
  titleLabel?: string;
  children: ReactNode;
}

/** The view switch. Lives in the topbar next to the actions, the way the roadmap
 *  board has always had it — the toolbar is for narrowing the list, not for
 *  choosing how to look at it. */
function ViewSwitch({ view }: { view: NonNullable<IssueBoardLayoutProps['view']> }) {
  return (
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
  );
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
  titleIcon,
  backLink,
  search,
  filters,
  view,
  actions,
  onTitleChange,
  titleLabel,
  children,
}: IssueBoardLayoutProps) {
  // View switch + primary action ride up to the topbar with the title; the
  // toolbar keeps only what narrows the list. A board with nothing to narrow
  // (the roadmap) then has no toolbar row at all.
  const hasToolbar = !!(search || filters);

  return (
    // A board is a full-screen page: no page padding, so the columns run to the
    // edges and the horizontal scrollbar sits on the bottom edge. Only the
    // toolbar is inset, to line up with the topbar above it.
    <FullScreenLayout>
      {/* PageHeader renders nothing here — it portals into the topbar. */}
      <PageHeader
        title={title}
        subtitle={subtitle}
        leading={titleIcon}
        onTitleChange={onTitleChange}
        titleLabel={titleLabel}
        actions={
          view || actions ? (
            <>
              {view && <ViewSwitch view={view} />}
              {actions}
            </>
          ) : undefined
        }
      />

      {backLink && <div className={cn('shrink-0 pt-6', BOARD_GUTTER)}>{backLink}</div>}

      {hasToolbar && (
        <div
          className={cn(
            'mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center',
            // Whichever comes first carries the gap from the topbar.
            backLink ? 'mt-2' : 'pt-6',
            BOARD_GUTTER,
          )}
        >
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
        </div>
      )}

      {children}
    </FullScreenLayout>
  );
}
