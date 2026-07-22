import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { IssueDetailMain, type IssueDetailMainProps } from './IssueDetailMain';

/**
 * One row in the Properties sidebar, Linear-style: a leading **icon** in the left
 * gutter and the value/control on the right of the same row — the label itself is
 * not drawn, it rides along as the icon's tooltip + screen-reader text (so the row
 * reads "icon + value", denser and less repetitive than "icon + label + value").
 * A row with no icon falls back to showing the label text, so it never goes blank.
 * Fields whose value needs the full width (a slider, a stack of selects, chips)
 * pass `align="stack"` to drop the control below the head — and there the label
 * *is* drawn (icon + text), since a full-width control has no inline value beside
 * the icon to explain it, so a lone glyph would read as orphaned.
 */
export function PropField({
  label,
  icon,
  align = 'inline',
  bare = false,
  children,
}: {
  label: string;
  /** A lucide icon (any size — forced to 14px here). Omit for a label-only row. */
  icon?: ReactNode;
  /** 'inline' (default) puts the control right of the label; 'stack' below it. */
  align?: 'inline' | 'stack';
  /**
   * The field supplies its *own* leading icon inside its control (a Select's
   * colour dot, a Combobox/Input/date-picker's inset glyph, or a {@link PropValue}
   * for read-only rows). Renders edge-to-edge with no icon/label gutter — the
   * label rides along as screen-reader text only. Used by the issue (task/bug)
   * sidebars; other sidebars keep the icon-gutter row above.
   */
  bare?: boolean;
  children: ReactNode;
}) {
  if (bare) {
    return (
      <div className={cn(align === 'stack' ? 'py-1' : 'py-0.5')}>
        <span className="sr-only">{label}</span>
        {children}
      </div>
    );
  }

  const head = (
    <span
      // The label is the icon's accessible name/tooltip; it isn't shown.
      title={label}
      className={cn(
        'flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground',
        // Inline: an icon-only gutter hugs the icon (leaving the value more room);
        // a label-only row keeps the wider text gutter so it stays legible.
        align === 'inline' && (icon ? 'pt-1.5' : 'w-28 pt-1.5'),
      )}
    >
      {icon ? (
        <>
          <span className="grid size-3.5 shrink-0 place-items-center text-muted-foreground/70 [&>svg]:size-3.5">
            {icon}
          </span>
          <span className="sr-only">{label}</span>
        </>
      ) : (
        <span className="truncate">{label}</span>
      )}
    </span>
  );

  if (align === 'stack') {
    return (
      <div className="flex flex-col gap-1.5 py-1">
        {/* Stacked rows keep a *visible* label (icon + text): the control below is
            full-width with no inline value beside the icon, so a lone glyph would
            read as orphaned. */}
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {icon && (
            <span className="grid size-3.5 shrink-0 place-items-center text-muted-foreground/70 [&>svg]:size-3.5">
              {icon}
            </span>
          )}
          <span className="truncate">{label}</span>
        </span>
        <div className="min-w-0">{children}</div>
      </div>
    );
  }
  return (
    <div className="flex min-h-8 items-start gap-2 py-0.5">
      {head}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * A read-only property value for a {@link PropField bare} row — a leading muted
 * icon + the value, inset and sized to match the editable field controls beside
 * it, so every row's icon lines up down the sidebar whether it's an input or
 * static text. `muted` greys the value (for "None"/placeholder states).
 */
export function PropValue({
  icon,
  muted = false,
  className,
  children,
}: {
  icon: ReactNode;
  muted?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex min-h-9 items-center gap-2 px-3 text-sm',
        muted && 'text-muted-foreground',
        className,
      )}
    >
      <span className="grid size-4 shrink-0 place-items-center text-muted-foreground/70 [&>svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </div>
  );
}

/** A titled group of Properties rows (e.g. "Properties", "Labels") — a small
 *  muted heading above its rows. Omit `label` to group without a heading. */
export function PropSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      {label && (
        <span className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          {label}
        </span>
      )}
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

/**
 * The two-column detail frame shared by every item detail — task, bug, and the
 * backlog (roadmap) item: a fluid main column beside a fixed 260px sidebar that
 * sticks on scroll. Drop the page's own main content as the first child and a
 * {@link PropSidebar} as the second, so the frame lives in one place while each
 * page keeps its own main (issue body, or the roadmap item's RICE/timing).
 */
export function DetailGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_260px]">{children}</div>
  );
}

/**
 * The Properties `<aside>` — the fixed-width sidebar column that sticks on scroll,
 * with `gap-5` between its <PropSection> groups. Shared so every detail page's
 * sidebar (issue or backlog item) sits in exactly the same frame. Fill it with
 * <PropSection> / <PropField> / <PropValue>.
 */
export function PropSidebar({ children }: { children: ReactNode }) {
  return <aside className="flex flex-col gap-5 md:sticky md:top-6">{children}</aside>;
}

interface IssueDetailProps extends IssueDetailMainProps {
  /** The Properties rows + delete action — the one part that differs between a
   *  task and a bug. Build them from <PropField> / <PropSection>. */
  sidebar: ReactNode;
}

/**
 * The whole issue-detail body, shared by Task detail and Bug detail: the shared
 * main column (title · description · activity) beside a Properties sidebar. The
 * two pages differ only in the `sidebar` rows they pass and how the page wraps
 * this (a route breadcrumb, or the inbox's in-place pane).
 *
 * Give it `key={issueId}` at the call site so a new subject gets a fresh subtree
 * — the uncontrolled title / description / type inputs seed from their initial
 * value once, which matters where the component is reused in place (the inbox).
 */
export function IssueDetail({ sidebar, ...main }: IssueDetailProps) {
  return (
    <DetailGrid>
      <IssueDetailMain {...main} />
      <PropSidebar>{sidebar}</PropSidebar>
    </DetailGrid>
  );
}
