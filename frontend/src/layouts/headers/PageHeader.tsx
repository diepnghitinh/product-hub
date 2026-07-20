import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { usePageTitle } from '@/layouts/head/PageTitleManager';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { usePageChrome } from '@/layouts/headers/PageChrome';

interface PageHeaderProps {
  title: string;
  /**
   * A crumb to sit in front of the title. Only needed for routes the nav model
   * doesn't know — Bugs, Tasks and team boards hang off the dynamic Teams list,
   * so `AppLayout` can't infer their parent. Everywhere else, leave it off.
   */
  parent?: { to: string; label: string };
  /**
   * Explains the page. There's no room for it in the topbar, so it rides along
   * as the crumb's tooltip rather than being thrown away.
   */
  subtitle?: string;
  /** Rendered immediately before the title (e.g. a team's symbol). */
  leading?: ReactNode;
  /** Right-aligned actions (buttons, links). */
  actions?: ReactNode;
  /**
   * Makes the title editable in place. Called with the trimmed new value, only
   * when it actually changed. Omit and the title stays plain text.
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

/**
 * A page's identity and actions — rendered into the shell's topbar, not in
 * place. The title becomes the last crumb of the breadcrumb; `AppLayout` puts the
 * section icon and parent link in front of it.
 *
 * Pages still just render `<PageHeader …/>` wherever it reads best in their
 * markup; the portal does the moving.
 */
export function PageHeader({
  title,
  parent,
  subtitle,
  leading,
  actions,
  onTitleChange,
  titleLabel,
  titleMaxLength = 160,
}: PageHeaderProps) {
  // The page's subject names the browser tab too — pages outside the nav model
  // (a bug, a team board) would otherwise fall back to just the app name.
  usePageTitle(title);
  const { crumb, actions: actionsSlot } = usePageChrome();

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

  const heading = (
    // The page's h1 lives here, in the topbar — there's exactly one per page and
    // it's the thing the breadcrumb ends on.
    <h1 className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold tracking-tight text-foreground">
      {leading}
      {parent && (
        <>
          <Link
            to={parent.to}
            className="shrink-0 font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {parent.label}
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
        </>
      )}
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
          // The border is always there but transparent, so revealing it on hover
          // costs no layout shift.
          className="-mx-1.5 min-w-0 max-w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[13px] font-semibold tracking-tight outline-none transition-colors hover:border-input focus:border-primary focus:ring-2 focus:ring-ring/30"
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
        <span className="truncate" title={subtitle}>
          {title}
        </span>
      )}
    </h1>
  );

  return (
    <>
      {crumb && createPortal(heading, crumb)}
      {actions && actionsSlot && createPortal(actions, actionsSlot)}
    </>
  );
}
