import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Sidebar } from '@/layouts/sidebar/Sidebar';
import { Topbar } from '@/layouts/headers/Topbar';
import { PageChromeContext } from '@/layouts/headers/PageChrome';
import { MainContent } from '@/layouts/content/MainContent';
import { PageTitleManager } from '@/layouts/head/PageTitleManager';

/**
 * The authenticated shell: a persistent nav rail, a fixed topbar, and the
 * routed page below it. Below md the rail becomes a drawer toggled from the
 * topbar.
 *
 * The shell knows nothing about individual routes. Width, padding and scrolling
 * belong to the page, which picks one of `layouts/shared` — so adding a
 * full-page surface never means editing this file. (It used to match pathnames
 * here, which meant every new board had to be registered.)
 */
export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Callback refs: the slots must exist before a page can portal into them, and
  // a plain ref wouldn't re-render to hand them down.
  const [crumbEl, setCrumbEl] = useState<HTMLElement | null>(null);
  const [actionsEl, setActionsEl] = useState<HTMLElement | null>(null);
  const { pathname } = useLocation();

  return (
    <PageTitleManager>
      <div className="flex min-h-[100dvh] sm:h-[100dvh] sm:overflow-hidden">
        <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

        {/* Dimmed backdrop behind the mobile drawer */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            onOpenMenu={() => setMobileOpen(true)}
            crumbRef={setCrumbEl}
            actionsRef={setActionsEl}
          />

          <PageChromeContext.Provider value={{ crumb: crumbEl, actions: actionsEl }}>
            <MainContent>
              {/* Keyed by route so navigating away from a crash recovers. */}
              <ErrorBoundary resetKey={pathname}>
                <Outlet />
              </ErrorBoundary>
            </MainContent>
          </PageChromeContext.Provider>
        </div>
      </div>
    </PageTitleManager>
  );
}
