import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';
import { Icon } from '@/components/Icon';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

/**
 * Authenticated layout: a persistent left navigation rail + routed content.
 * Below the md breakpoint the rail becomes a drawer toggled by the slim mobile bar.
 */
export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  // Kanban surfaces (the bug board, a roadmap board) span the full page width and
  // scroll their columns horizontally, instead of sitting in the centered 1200px column.
  const fullBleed = pathname === '/bugs' || /^\/roadmaps\/[^/]+$/.test(pathname);
  // The roadmap board is a full-height kanban (columns scroll internally, the
  // board scrolls horizontally with the bar pinned at the bottom). Other
  // full-bleed pages keep normal page scroll.
  const fullHeight = /^\/roadmaps\/[^/]+$/.test(pathname);

  return (
    <div className={cn('flex min-h-[100dvh]', fullHeight && 'sm:h-[100dvh] sm:overflow-hidden')}>
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
        {/* Slim bar — only shown on mobile to open the drawer */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:hidden">
          <button
            type="button"
            className="grid size-9 place-items-center rounded-md text-foreground hover:bg-accent"
            onClick={() => setMobileOpen(true)}
            aria-label={t('nav.menu')}
          >
            <Icon name="menu" size={20} />
          </button>
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="text-primary">◑</span> {t('app.name')}
          </Link>
        </header>

        <main
          className={cn(
            'min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8',
            fullBleed ? 'flex flex-col' : 'mx-auto w-full max-w-[1200px]',
            fullHeight && 'sm:min-h-0 sm:overflow-hidden',
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
