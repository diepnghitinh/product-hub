import { createContext, useContext } from 'react';

export interface PageChromeSlots {
  /** Where a page's trailing breadcrumb renders. */
  crumb: HTMLElement | null;
  /** Immediately after the breadcrumb — a page's inline title actions (e.g. the
   *  issue ⋯ overflow menu) render here. */
  crumbActions: HTMLElement | null;
  /** Where a page's actions render, right-aligned in the topbar. */
  actions: HTMLElement | null;
}

/**
 * The topbar's two slots, handed down by `AppLayout`.
 *
 * Pages publish into them with `PageHeader`, which portals rather than pushing
 * state up: the payload is JSX, and a context setter would re-fire on every
 * render. Portals let React reconcile it like any other child.
 */
export const PageChromeContext = createContext<PageChromeSlots>({
  crumb: null,
  crumbActions: null,
  actions: null,
});

export const usePageChrome = () => useContext(PageChromeContext);
