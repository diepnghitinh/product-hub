import type { ReactNode } from 'react';

/**
 * The routed area, between the topbar and the page.
 *
 * Deliberately owns **no width, padding or scrolling** — each page declares its
 * own via `layouts/shared` (CenteredPageLayout / FullWidthPageLayout /
 * FullScreenLayout). That's what keeps the shell from having to know route
 * names: it used to decide full-bleed by matching pathnames, so every new
 * full-page route meant editing the shell.
 *
 * From `sm` up it's a fixed-height flex child that clips, so a page can either
 * scroll inside it or fill it exactly (the boards). Below `sm` the document
 * scrolls as normal, which is what mobile browsers expect.
 */
export function MainContent({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-w-0 flex-1 flex-col sm:min-h-0 sm:overflow-hidden">{children}</main>
  );
}
