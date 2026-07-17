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
      { path: '/inbox', labelKey: 'nav.inbox', icon: 'inbox', badge: 'inbox' },
    ],
  },
  {
    // Product Discovery — decide what's worth building (the what & why).
    headingKey: 'navgroup.discovery',
    items: [
      { path: '/roadmaps', labelKey: 'nav.roadmaps', icon: 'roadmap' },
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
  {
    headingKey: 'navgroup.admin',
    items: [
      { path: '/admin/people', labelKey: 'nav.people', icon: 'people', adminOnly: true },
      { path: '/admin/settings', labelKey: 'nav.settings', icon: 'settings', adminOnly: true },
    ],
  },
];
