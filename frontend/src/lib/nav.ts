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
    items: [{ path: '/', labelKey: 'nav.home', icon: 'home', end: true }],
  },
  {
    headingKey: 'navgroup.delivery',
    items: [
      { path: '/projects', labelKey: 'nav.projects', icon: 'projects' },
      { path: '/bugs', labelKey: 'nav.bugs', icon: 'bug' },
    ],
  },
  {
    headingKey: 'navgroup.planning',
    items: [
      { path: '/roadmaps', labelKey: 'nav.roadmaps', icon: 'roadmap' },
      { path: '/milestones', labelKey: 'nav.milestones', icon: 'milestone' },
    ],
  },
  {
    headingKey: 'navgroup.you',
    items: [{ path: '/inbox', labelKey: 'nav.inbox', icon: 'inbox', badge: 'inbox' }],
  },
  {
    headingKey: 'navgroup.admin',
    items: [
      { path: '/admin/people', labelKey: 'nav.people', icon: 'people', adminOnly: true },
      { path: '/admin/settings', labelKey: 'nav.settings', icon: 'settings', adminOnly: true },
    ],
  },
];
