import type { I18nKey } from '@/i18n/en';
import type { NavItem } from '@/layouts/sidebar/menuConfig';

/**
 * The **classic** side menu's model: one column, every section of the app stacked
 * in it under titled groups. Selected via Profile → Side menu (`useNavStyle`);
 * the two-level model lives in `menuConfig.ts` as `NAV_AREAS`.
 *
 * The two models are separate on purpose. They arrange the *same* destinations
 * differently — flat-with-headings vs. an area you pick first — and a shared
 * structure would have to be the union of both shapes, which is neither. `NavItem`
 * itself is shared, so a row's icon, badge and `end` rule are defined once.
 *
 * This is a snapshot of the sidebar as it stood before the two-level rebuild, so
 * it has no Bugs row (a bug was reached from its team's board) and no Design
 * patterns row (the two-level menu's More area added those), and People/Settings
 * live in the profile menu — see `PROFILE_NAV_ITEMS`.
 */
export interface NavGroup {
  /** i18n key for the group heading. Doubles as the section's collapse id. */
  headingKey: I18nKey;
  items: NavItem[];
}

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
      // Directly under My Tasks, because it's the same work seen by date. Only
      // the one row: the two-level menu gives Calendar an area whose panel can
      // hold its `?source=` scopes, and this menu has no panel to hold them —
      // they're a scope of this page, reachable from its own toolbar, not three
      // separate destinations to stack in a flat list.
      { path: '/calendar', labelKey: 'nav.calendar', icon: 'calendar' },
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
    //
    // No OKRs row: it's a tab of the roadmaps page, and `alsoAt` keeps this row
    // the one that lights up there. Same call as the two-level menu — a row that
    // exists in one menu style and not the other is how the two drift apart.
    headingKey: 'navgroup.discovery',
    items: [
      { path: '/roadmaps', labelKey: 'nav.roadmaps', icon: 'roadmap', alsoAt: ['/okrs'] },
      { path: '/docs', labelKey: 'nav.docs', icon: 'docs' },
    ],
  },
  {
    // Product Delivery — build & verify it (the how). Engineer-facing. Bugs and
    // Tasks aren't listed: each is a team's issue list, rendered dynamically
    // under "Teams" below this group.
    headingKey: 'navgroup.delivery',
    items: [{ path: '/testing', labelKey: 'nav.projects', icon: 'projects' }],
  },
];

/**
 * The workspace-admin destinations, which the classic menu keeps in the profile
 * (avatar) menu rather than in a group of its own — it has no group for them, and
 * the two-level menu's **More** area does. `ProfileMenu` renders these only while
 * the classic menu is on, so there is exactly one route to each either way, never
 * two.
 *
 * Design patterns is here because More is its *only* link: without this row,
 * choosing the classic menu would leave a page in the app you can reach solely by
 * typing its URL. Anything More gains later needs the same thought.
 */
export const PROFILE_NAV_ITEMS: NavItem[] = [
  { path: '/admin/people', labelKey: 'nav.people', icon: 'people', adminOnly: true },
  { path: '/admin/settings', labelKey: 'nav.settings', icon: 'settings', adminOnly: true },
  { path: '/design-patterns', labelKey: 'nav.designPatterns', icon: 'sparkles', adminOnly: true },
];
