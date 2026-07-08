import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';
import { Icon } from '@/components/Icon';
import { t } from '@/i18n';

/**
 * Authenticated layout: a persistent left navigation rail + routed content.
 * Below the md breakpoint the rail becomes a drawer toggled by the slim mobile bar.
 */
export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-[100dvh]">
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

        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
