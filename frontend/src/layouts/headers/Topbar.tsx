import { Link, useLocation } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { findNavItem } from '@/layouts/sidebar/menuConfig';
import { t } from '@/i18n';

interface TopbarProps {
  /** Opens the nav drawer; only rendered below md. */
  onOpenMenu: () => void;
  /** Slot refs — the page portals its trailing crumb and actions into these. */
  crumbRef: (el: HTMLElement | null) => void;
  actionsRef: (el: HTMLElement | null) => void;
}

/**
 * The fixed bar above the routed page: nav toggle, breadcrumb, page actions.
 *
 * The leading crumb is the nav section this route sits under, and becomes a
 * link once you're deeper than the section's own page. Pages outside the nav
 * model (a bug, a team board) have no section, so their own crumb is the root.
 */
export function Topbar({ onOpenMenu, crumbRef, actionsRef }: TopbarProps) {
  const { pathname } = useLocation();
  const section = findNavItem(pathname);
  const atSectionRoot = section?.path === pathname;

  return (
    // h-12 lines up with the sidebar's brand row.
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-1.5 border-b bg-background/80 px-4 backdrop-blur md:px-6">
      <button
        type="button"
        className="-ml-1 grid size-8 shrink-0 place-items-center rounded-md text-foreground hover:bg-accent md:hidden"
        onClick={onOpenMenu}
        aria-label={t('nav.menu')}
      >
        <Icon name="menu" size={18} />
      </button>

      <nav className="flex min-w-0 flex-1 items-center gap-1.5" aria-label="Breadcrumb">
        {section && <Icon name={section.icon} size={16} className="shrink-0 text-muted-foreground" />}
        {section && !atSectionRoot && (
          <>
            <Link
              to={section.path}
              className="shrink-0 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t(section.labelKey)}
            </Link>
            <Icon
              name="chevron-right"
              size={14}
              className="shrink-0 text-muted-foreground/50"
              aria-hidden
            />
          </>
        )}
        {/* The page's own crumb lands here. */}
        <span ref={crumbRef} className="flex min-w-0 items-center" />
      </nav>

      <div ref={actionsRef} className="flex shrink-0 items-center gap-2" />
    </header>
  );
}
