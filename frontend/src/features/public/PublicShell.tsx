import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { t } from '@/i18n';

/** Chrome for a public (no-auth) page: a slim topbar with the product mark, a
 * "read-only" badge and the theme toggle, then a full-height body. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b bg-background px-4 sm:px-6">
        <span className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
          <span className="text-primary">◑</span> product-hub
        </span>
        <div className="flex items-center gap-3">
          <Badge variant="muted">{t('public.viewOnly')}</Badge>
          <ThemeToggle />
        </div>
      </header>
      {children}
    </div>
  );
}
