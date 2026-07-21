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
  /** Small leading icon shown in the sub-header tab (ClickUp-style). Optional so
   *  a board can opt out, but pass one — the tabs read best with icons. */
  icon?: ReactNode;
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

/** The view switch, rendered as a sub-header tab strip beneath the topbar
 *  (ClickUp-style): a full-width hairline with an underlined, icon-led tab per
 *  view. Every board renders through this shell, so they all get the identical
 *  sub-header — the toolbar below stays for narrowing the list, not for choosing
 *  how to look at it. */
function ViewTabs({ view }: { view: NonNullable<IssueBoardLayoutProps['view']> }) {
  return (
    <div className={cn('flex shrink-0 items-center gap-1 border-b', BOARD_GUTTER)}>
      {view.options.map((o) => {
        const active = view.value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => view.onChange(o.value)}
            className={cn(
              // -mb-px drops the tab's own border onto the strip's, so the active
              // underline reads as one continuous line with the hairline.
              'relative -mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-sm transition-colors',
              active
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {o.icon && <span className="grid place-items-center [&>svg]:size-4">{o.icon}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The shared shell for every team's issue list — QC (bugs) and Engineering
 * (tasks) render through this, so both get the same header, the same sub-header
 * view tabs, the same toolbar row (search · filters), and the same full-height
 * content area. Previously each board built its own chrome and they drifted apart.
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
  // The primary action rides up to the topbar with the title; the view switch
  // gets its own sub-header tab strip beneath it; the toolbar keeps only what
  // narrows the list. A board with nothing to narrow (the roadmap) has no
  // toolbar row at all.
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
        leading={titleIcon ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent/60 hover:text-accent-foreground">
            {titleIcon}
          </span>
        ) : null}
        onTitleChange={onTitleChange}
        titleLabel={titleLabel}
        actions={actions}
      />

      {/* Sub-header: the view tabs sit in their own row beneath the topbar. */}
      {view && <ViewTabs view={view} />}

      {backLink && <div className={cn('shrink-0 pt-6', BOARD_GUTTER)}>{backLink}</div>}

      {hasToolbar && (
        <div
          className={cn(
            'mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center',
            // Whichever comes first carries the gap; the sub-header tabs already
            // add a hairline above, so the toolbar needs less room after them.
            backLink ? 'mt-2' : view ? 'pt-4' : 'pt-6',
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
