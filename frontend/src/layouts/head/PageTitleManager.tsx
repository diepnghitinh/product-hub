import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { t } from '@/i18n';
import { findNavItem } from '@/layouts/sidebar/menuConfig';

/** What a page published, and the route it published it for. */
interface TitleEntry {
  path: string;
  title: string;
}

const PageTitleContext = createContext<(title: string | null) => void>(() => {});

/**
 * Names the browser tab: the page's own subject when it publishes one, else the
 * nav section for the route, else just the app.
 */
export function PageTitleManager({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [entry, setEntry] = useState<TitleEntry | null>(null);

  // Stamped with the route it was set for, rather than cleared on navigation:
  // child effects run before parent ones, so a reset here would wipe the title
  // the incoming page just published.
  const publish = useCallback((title: string | null) => {
    setEntry(title ? { path: window.location.pathname, title } : null);
  }, []);

  useEffect(() => {
    const app = t('app.name');
    // A title from a route we've since left is simply ignored.
    const fromPage = entry?.path === pathname ? entry.title : null;
    const section = findNavItem(pathname);
    const name = fromPage ?? (section ? t(section.labelKey) : null);
    document.title = name ? `${name} · ${app}` : app;
  }, [pathname, entry]);

  return <PageTitleContext.Provider value={publish}>{children}</PageTitleContext.Provider>;
}

/**
 * Name the tab after this page's subject. `PageHeader` already does this with
 * its title, so most pages need nothing; call it directly only for a page that
 * renders no PageHeader.
 */
export function usePageTitle(title: string | null | undefined): void {
  const publish = useContext(PageTitleContext);
  useEffect(() => {
    publish(title ?? null);
  }, [publish, title]);
}
