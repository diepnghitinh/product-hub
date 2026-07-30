import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Which side menu the app draws.
 *
 * - `two-level` — the icon rail of areas beside one panel of that area's rows.
 * - `classic` — one column with every section of the app stacked in it.
 *
 * Both are real, maintained menus reading the same data; they differ only in how
 * the destinations are arranged. Kept as a *choice* rather than a migration
 * because the two-level shape trades breadth for depth: fewer rows on screen,
 * one more click to reach a row in an area you're not in. Which of those costs
 * more depends on how someone works, and that isn't ours to decide for them.
 */
export type NavStyle = 'two-level' | 'classic';

const STORAGE_KEY = 'ph_nav_style';

/** An explicit stored choice wins; otherwise the two-level menu, the default. */
function getInitialNavStyle(): NavStyle {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'two-level' || stored === 'classic') return stored;
  } catch {
    /* ignore */
  }
  return 'two-level';
}

interface NavStyleState {
  navStyle: NavStyle;
  setNavStyle: (style: NavStyle) => void;
}

const NavStyleContext = createContext<NavStyleState | undefined>(undefined);

/**
 * Per-browser, like the theme beside it — one member preferring the classic menu
 * never rearranges anyone else's sidebar. Lives in context rather than being read
 * from `localStorage` at each call site so switching re-renders the shell
 * immediately, with no reload.
 */
export function NavStyleProvider({ children }: { children: ReactNode }) {
  const [navStyle, setNavStyle] = useState<NavStyle>(getInitialNavStyle);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, navStyle);
    } catch {
      /* ignore */
    }
  }, [navStyle]);

  return (
    <NavStyleContext.Provider value={{ navStyle, setNavStyle }}>{children}</NavStyleContext.Provider>
  );
}

export function useNavStyle(): NavStyleState {
  const ctx = useContext(NavStyleContext);
  if (!ctx) throw new Error('useNavStyle must be used within a NavStyleProvider');
  return ctx;
}
