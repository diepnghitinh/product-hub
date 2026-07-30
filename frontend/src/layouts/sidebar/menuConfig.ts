import type { IconName } from '@/components/Icon';
import type { I18nKey } from '@/i18n/en';

/**
 * The sidebar's information architecture, in two levels.
 *
 * **Level 1 — areas.** The icon rail. Five stops that answer "what am I doing?":
 * what's *mine* (Home), deciding what to build (Discovery), building it
 * (Delivery), verifying it (Quality), and running the workspace (More). The
 * Discovery/Delivery split is the product's own vocabulary, not a UI invention.
 *
 * **Level 2 — sections + items.** One panel per area, holding only that area's
 * destinations. Nothing is listed in two areas: a row has exactly one home, so
 * there's never a second copy to keep in sync (which is why Teams live in
 * Delivery alone, and the rail reopens the area you last used instead).
 *
 * A third level exists only where an item genuinely nests — a cycles-enabled
 * team's Current/Upcoming. It is not a place to file more navigation.
 */

export interface NavItem {
  path: string;
  /** i18n key for the label. */
  labelKey: I18nKey;
  icon: IconName;
  /** Show only to admins. */
  adminOnly?: boolean;
  /** Route matching should be exact (index route). */
  end?: boolean;
  /** Render the inbox unread badge. */
  badge?: 'inbox';
  /** Sub-items rendered under a collapsible parent. */
  children?: NavItem[];
  /** Render the current user's avatar instead of `icon` (used for "Assigned to me"). */
  avatar?: boolean;
  /**
   * The query this row carries (`kind=bug`). The row links to `path?search` and
   * highlights only while the live URL carries it — so two rows that share a
   * pathname (All issues, Bugs) never light up together. Without it a row
   * matches on pathname alone, the way `NavLink` does.
   */
  search?: string;
}

/** A block inside an area's panel. */
export interface NavSection {
  /** Stable id for the collapse memory — survives a label change. */
  key: string;
  /** Absent = the panel's lead group: no heading, and never collapsible. */
  headingKey?: I18nKey;
  items: NavItem[];
  /** A block the sidebar fills from the API rather than from this file. */
  dynamic?: 'favourites' | 'teams';
}

/** A level-1 area: one button on the icon rail, one panel beside it. */
export interface NavArea {
  /** Stable id — used by the remembered-area key, so don't rename casually. */
  id: string;
  /** i18n key for both the rail's micro-label and the panel's title. */
  labelKey: I18nKey;
  icon: IconName;
  /**
   * Where the rail button lands. Every area has one, so a rail click is never a
   * dead end that only opens a panel.
   */
  path: string;
  /** Hide the whole area (rail button included) from non-admins. */
  adminOnly?: boolean;
  sections: NavSection[];
}

export const NAV_AREAS: NavArea[] = [
  {
    // Home — everything that is *mine*: what's waiting on me, what I'm on today,
    // and who on my team is carrying what. No shared artefact is filed here.
    id: 'home',
    labelKey: 'navarea.home',
    icon: 'home',
    path: '/',
    sections: [
      // Pinned entities, first thing in the panel. Filled from the API and
      // hidden when the user has pinned nothing.
      { key: 'favourites', headingKey: 'nav.favourites', items: [], dynamic: 'favourites' },
      {
        // The lead group: no heading, because in the Home panel these *are* the
        // page. My Tasks used to be a collapsible parent holding the three
        // "mine" views — the rail is that level now, so they sit flat.
        key: 'home.mine',
        items: [
          { path: '/inbox', labelKey: 'nav.inbox', icon: 'inbox', badge: 'inbox' },
          {
            path: '/issues/me',
            labelKey: 'nav.assignedToMe',
            icon: 'user-check',
            avatar: true,
            end: true,
          },
          { path: '/issues/today', labelKey: 'nav.today', icon: 'calendar' },
          { path: '/issues/personal', labelKey: 'nav.personalList', icon: 'user-list' },
          { path: '/my-team', labelKey: 'nav.myTeam', icon: 'people' },
        ],
      },
    ],
  },
  {
    // Discovery — decide what's worth building (the what & why).
    id: 'discovery',
    labelKey: 'navarea.discovery',
    icon: 'compass',
    path: '/roadmaps',
    sections: [
      {
        key: 'discovery.main',
        items: [
          { path: '/roadmaps', labelKey: 'nav.roadmaps', icon: 'roadmap' },
          { path: '/okrs', labelKey: 'nav.milestones', icon: 'milestone' },
          { path: '/docs', labelKey: 'nav.docs', icon: 'book' },
        ],
      },
    ],
  },
  {
    // Delivery — build it (the how). Teams and their boards live here, and only
    // here; each team is a "space" with its own statuses and cycles.
    id: 'delivery',
    labelKey: 'navarea.delivery',
    icon: 'rocket',
    path: '/issues',
    sections: [
      {
        key: 'delivery.work',
        items: [{ path: '/issues', labelKey: 'nav.allIssues', icon: 'checks', end: true }],
      },
      { key: 'teams', headingKey: 'navgroup.teams', items: [], dynamic: 'teams' },
    ],
  },
  {
    // Quality — verify it. Test projects and their reports, plus the workspace's
    // bugs seen as one list rather than per team board.
    id: 'quality',
    labelKey: 'navarea.quality',
    icon: 'flask',
    path: '/testing',
    sections: [
      {
        key: 'quality.main',
        items: [
          { path: '/testing', labelKey: 'nav.projects', icon: 'projects' },
          // The unified board narrowed to bugs. `search` is what keeps this row
          // and All Issues (same pathname) from both highlighting.
          { path: '/issues', search: 'kind=bug', labelKey: 'nav.bugs', icon: 'bug', end: true },
        ],
      },
    ],
  },
  {
    // More — running the workspace. Admin-only, and the *one* home for People and
    // Settings: they used to sit in the profile menu, which mixed "who I am" with
    // "how the workspace is configured".
    id: 'more',
    labelKey: 'navarea.more',
    icon: 'more',
    path: '/admin/people',
    adminOnly: true,
    sections: [
      {
        key: 'more.admin',
        items: [
          { path: '/admin/people', labelKey: 'nav.people', icon: 'people', adminOnly: true },
          { path: '/admin/settings', labelKey: 'nav.settings', icon: 'settings', adminOnly: true },
          {
            path: '/design-patterns',
            labelKey: 'nav.designPatterns',
            icon: 'sparkles',
            adminOnly: true,
          },
        ],
      },
    ],
  },
];

/** Every item in the model, children first — see `findNavItem`. */
function allItems(): NavItem[] {
  return NAV_AREAS.flatMap((a) =>
    a.sections.flatMap((s) => s.items.flatMap((i) => [...(i.children ?? []), i])),
  );
}

/**
 * Whether the live URL carries every param a `search` row asked for. Extra params
 * don't disqualify it: `/issues?kind=bug&assignee=me` is still the Bugs row, just
 * filtered further.
 */
export function searchMatches(urlSearch: string, want: string) {
  const have = new URLSearchParams(urlSearch);
  return [...new URLSearchParams(want)].every(([k, v]) => have.get(k) === v);
}


/**
 * The nav entry a route belongs to — the topbar reads it for the breadcrumb's
 * icon and its parent link. Longest match wins, so `/admin/settings` beats a
 * hypothetical `/admin`. Not every route has one: a team's board hangs off the
 * dynamic Teams list, so those pages name their own parent.
 *
 * Children come before the parent that lists them: a parent row may share its
 * first child's path, and the row the user actually clicked is the more specific
 * answer. `end` is a *highlight* rule for the sidebar's NavLink, not a parenting
 * one — All Issues is `end` so it stays dark on `/issues/me`, yet it's still the
 * crumb an issue's own page hangs under.
 *
 * Takes a pathname only, so a `search` row can't be told apart here: `/issues`
 * resolves to All Issues even at `?kind=bug`. The crumb is the board either way.
 */
export function findNavItem(pathname: string): NavItem | undefined {
  const all = allItems();
  const exact = all.find((i) => i.path === pathname && !i.search);
  if (exact) return exact;
  return all
    .filter((i) => !i.search && pathname.startsWith(`${i.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

/**
 * Routes that belong to an area no `NavItem` names. Teams are dynamic, and a
 * project-scoped bug board is only ever reached from a test report.
 */
const AREA_PREFIXES: [prefix: string, areaId: string][] = [
  ['/teams/', 'delivery'],
  ['/bugs', 'quality'],
];

/**
 * Which area a route lives in — the rail follows it, so a deep link or a
 * breadcrumb jump moves the panel with you.
 *
 * `undefined` means "no opinion", and the rail then stays where it is: create
 * pages (`/tasks/new`) and account pages (`/profile`) are reached from anywhere,
 * so yanking the panel under the user would lose their place for nothing.
 *
 * Takes the query, because a pathname can be claimed twice: `/issues?kind=bug`
 * is both Quality's Bugs row and Delivery's board with its Tasks/Bugs toggle
 * flipped — the same URL, reached two ways. Neither claim wins, so that too is
 * "no opinion": clicking Bugs keeps you in Quality, and filtering the board
 * keeps you in Delivery, instead of the rail jumping under either one.
 */
export function findAreaId(pathname: string, search = ''): string | undefined {
  if (pathname === '/tasks/new' || pathname === '/bugs/new') return undefined;

  let best: { id: string; len: number } | undefined;
  let searchOwner: string | undefined;
  for (const area of NAV_AREAS) {
    for (const section of area.sections) {
      for (const item of section.items.flatMap((i) => [...(i.children ?? []), i])) {
        if (item.search !== undefined) {
          // A `search` row claims a route only with its query attached — never on
          // pathname alone, or plain `/issues` would read as Quality's Bugs.
          if (item.path === pathname && searchMatches(search, item.search)) searchOwner = area.id;
          continue;
        }
        if (pathname === item.path || pathname.startsWith(`${item.path}/`)) {
          if (!best || item.path.length > best.len) best = { id: area.id, len: item.path.length };
        }
      }
    }
  }
  // Contested → nobody. Uncontested → the row that asked for it.
  if (searchOwner) return best ? undefined : searchOwner;
  if (best) return best.id;

  return AREA_PREFIXES.find(([prefix]) => pathname.startsWith(prefix))?.[1];
}
