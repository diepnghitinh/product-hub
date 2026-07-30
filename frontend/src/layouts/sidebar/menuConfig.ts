import type { IconName } from '@/components/Icon';
import type { I18nKey } from '@/i18n/en';

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
  /** Sub-items rendered under a collapsible parent (e.g. My Tasks). */
  children?: NavItem[];
  /** Render the current user's avatar instead of `icon` (used for "Assigned to me"). */
  avatar?: boolean;
}

export interface NavGroup {
  /** i18n key for the group heading. */
  headingKey: I18nKey;
  items: NavItem[];
}

/** The primary sidebar navigation model — rendered by `Sidebar`. */
export const NAV_GROUPS: NavGroup[] = [
  {
    headingKey: 'navgroup.overview',
    items: [
      { path: '/', labelKey: 'nav.home', icon: 'home', end: true },
      {
        // My Tasks — the daily queue, and the only *personal* thing here, which
        // is why it's the one collapsible parent: the three views under it are
        // all "mine", cut three ways. Its own path is its first child's, so the
        // collapsed icon rail (which can't nest) still lands somewhere useful.
        path: '/issues/me',
        labelKey: 'nav.tasks',
        icon: 'user-check',
        children: [
          {
            path: '/issues/me',
            labelKey: 'nav.assignedToMe',
            icon: 'tasks',
            avatar: true,
            end: true,
          },
          { path: '/issues/today', labelKey: 'nav.today', icon: 'calendar' },
          { path: '/issues/personal', labelKey: 'nav.personalList', icon: 'user-list' },
        ],
      },
      // Level 0, beside My Team — these three are the app's scopes, and reading
      // them down the rail widens: my work, everyone's work, my team's people.
      // `end` keeps this row dark while you're on one of My Tasks' /issues/*
      // views; it stays the parent crumb for an issue's own page (`findNavItem`).
      { path: '/issues', labelKey: 'nav.allIssues', icon: 'checks', end: true },
      { path: '/my-team', labelKey: 'nav.myTeam', icon: 'people' },
      { path: '/inbox', labelKey: 'nav.inbox', icon: 'inbox', badge: 'inbox' },
    ],
  },
  {
    // Product Discovery — decide what's worth building (the what & why).
    headingKey: 'navgroup.discovery',
    items: [
      { path: '/roadmaps', labelKey: 'nav.roadmaps', icon: 'roadmap' },
      { path: '/docs', labelKey: 'nav.docs', icon: 'book' },
      { path: '/okrs', labelKey: 'nav.milestones', icon: 'milestone' },
    ],
  },
  {
    // Product Delivery — build & verify it (the how). Engineer-facing.
    headingKey: 'navgroup.delivery',
    // Bugs + Tasks are no longer listed here — each is a team's issue list and
    // the sidebar renders those dynamically under "Teams".
    items: [{ path: '/testing', labelKey: 'nav.projects', icon: 'projects' }],
  },
  // Admin (People + Settings) is no longer a sidebar group — it moved into the
  // profile menu (see `PROFILE_NAV_ITEMS` + the footer menu in `Sidebar`).
];

/**
 * People + Settings live in the profile (avatar) menu now, not the sidebar. Kept
 * as nav items so their routes still resolve a breadcrumb icon + document title
 * (`findNavItem` searches these too), and so the profile menu renders them from
 * one source instead of hardcoding.
 */
export const PROFILE_NAV_ITEMS: NavItem[] = [
  { path: '/admin/people', labelKey: 'nav.people', icon: 'people', adminOnly: true },
  { path: '/admin/settings', labelKey: 'nav.settings', icon: 'settings', adminOnly: true },
];

/**
 * The nav entry a route belongs to — the topbar reads it for the breadcrumb's
 * icon and its parent link. Longest match wins, so `/admin/settings` beats a
 * hypothetical `/admin`. Not every route has one: Bugs, Tasks and a team's board
 * hang off the dynamic Teams list, so those pages name their own parent.
 *
 * Children come before the parent that lists them: a group's row may share its
 * first child's path (My Tasks does), and the row the user actually clicked is
 * the more specific answer. `end` is a *highlight* rule for the sidebar's
 * NavLink, not a parenting one — All Issues is `end` so it stays dark on
 * `/issues/me`, yet it's still the crumb an issue's own page hangs under.
 */
export function findNavItem(pathname: string): NavItem | undefined {
  const all = [
    ...NAV_GROUPS.flatMap((g) => g.items.flatMap((i) => [...(i.children ?? []), i])),
    ...PROFILE_NAV_ITEMS,
  ];
  const exact = all.find((i) => i.path === pathname);
  if (exact) return exact;
  return all
    .filter((i) => pathname.startsWith(`${i.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
}
