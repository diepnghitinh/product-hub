import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Right-aligned actions (buttons, links). */
  actions?: ReactNode;
  /**
   * Makes the title editable in place. Called with the trimmed new value, only
   * when it actually changed. Omit and the title stays a plain heading.
   */
  onTitleChange?: (title: string) => void;
  /** Accessible name for the title field. Only used with `onTitleChange`. */
  titleLabel?: string;
  /** Cap on the title, to match whatever the API accepts. */
  titleMaxLength?: number;
}

/** Width, in characters, that roughly fits the text — so the field hugs the
 *  title instead of leaving a wide empty box beside a short name. */
const titleSize = (value: string) => Math.max(8, Math.min(value.length + 1, 40));

/** Consistent page title row used across the top-level list pages. */
export function PageHeader({
  title,
  subtitle,
  actions,
  onTitleChange,
  titleLabel,
  titleMaxLength = 160,
}: PageHeaderProps) {
  /** Blank or unchanged snaps back rather than saving — the field is
   *  uncontrolled, so nothing else would restore it. */
  function commit(input: HTMLInputElement) {
    const next = input.value.trim();
    if (!next || next === title) {
      input.value = title;
      return;
    }
    onTitleChange?.(next);
  }

  return (
    // shrink-0: on the full-height kanban pages this is a flex child and would
    // otherwise squash; inert everywhere else (non-flex parents).
    <header className="mb-8 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {/* Stays an h1 either way, so the page keeps its heading. */}
        <h1 className="text-2xl font-semibold tracking-tight">
          {onTitleChange ? (
            <input
              // Remounts when the title changes server-side, which is also what
              // resets the field after a successful save.
              key={title}
              defaultValue={title}
              aria-label={titleLabel}
              title={titleLabel}
              maxLength={titleMaxLength}
              size={titleSize(title)}
              // The border is always there but transparent, so revealing it on
              // hover costs no layout shift.
              className="-mx-2 max-w-full rounded-md border border-transparent bg-transparent px-2 py-0.5 text-2xl font-semibold tracking-tight outline-none transition-colors hover:border-input focus:border-primary focus:ring-2 focus:ring-ring/30"
              // Grow with the text as you type, without a re-render.
              onInput={(e) => {
                e.currentTarget.size = titleSize(e.currentTarget.value);
              }}
              onBlur={(e) => commit(e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.currentTarget.value = title;
                  e.currentTarget.blur();
                }
              }}
            />
          ) : (
            title
          )}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
