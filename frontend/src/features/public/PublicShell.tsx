import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { t } from '@/i18n';

/** Chrome for a public (no-auth) page: a slim topbar with the product mark, a
 * "read-only" badge and the theme toggle, then a full-height body. `title`
 * (e.g. the shared roadmap/team's name) renders centered in that same topbar —
 * three equal-width flex columns keep it centered on the bar regardless of how
 * wide the brand mark or the badge/toggle group are. */
export function PublicShell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b bg-background px-4 sm:px-6">
        <div className="flex flex-1 items-center gap-2 font-semibold tracking-tight text-foreground">
          <span className="text-primary">◑</span> product-hub
        </div>
        {title && (
          <h1 className="flex-1 truncate text-center text-sm font-medium text-foreground">{title}</h1>
        )}
        <div className="flex flex-1 items-center justify-end gap-3">
          <Badge variant="muted">{t('public.viewOnly')}</Badge>
          <ThemeToggle />
        </div>
      </header>
      {children}
    </div>
  );
}
