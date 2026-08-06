import type { IconName } from '@/components/Icon';
import type { I18nKey } from '@/i18n/en';
import { designPatternsEnabled } from '@/lib/env';

/**
 * The sidebar's information architecture, in two levels.
 *
 * **Level 1 — areas.** The icon rail, now two stops: **Workspace**, everything
 * you do with the product, and **More**, running the workspace itself (admin
 * only). Home, Discovery, Delivery and Quality used to be four separate stops;
 * they are the *phases of one job*, and splitting them across the rail meant a
 * click on the rail before most navigation — so they merged into one panel and
 * kept their names as its headings. The product's own vocabulary is intact;
 * only the hop between panels is gone.
 *
 * **Level 2 — sections + items.** The panel's blocks. Nothing is listed twice:
 * a row has exactly one home, so there's never a second copy to keep in sync.
 * The lead block (what's *mine*) carries no heading — in the panel it reads as
 * the page itself; every block after it is a collapsible heading, so a long
 * panel folds down to the parts you use.
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
  /**
   * Other routes this row is the home of. A *tabbed page* is one destination at
   * several URLs — `/okrs` is the planning page's other tab, not somewhere else
   * — and without this the row would go dark the moment you switched tab, which
   * reads as the nav losing you. Prefix-matched like `path`, so detail routes
   * under it (`/okrs/:id`) are covered too.
   */
  alsoAt?: string[];
}

/** A block inside an area's panel. */
export interface NavSection {
  /** Stable id for the collapse memory — survives a label change. */
  key: string;
  /** Absent = the panel's lead group: no heading, and never collapsible. */
  headingKey?: I18nKey;
  items: NavItem[];
  /**
   * A block the sidebar fills from the API rather than from this file.
   * `favourites` *is* the whole block (its `items` are empty); `teams` is
   * **appended after** `items`, so Delivery can lead with All issues and follow
   * with the team spaces as one list.
   */
  dynamic?: 'favourites' | 'teams';
  /**
   * Close this block off with a hairline. Reserved for the two blocks that are
   * *yours* rather than the app's structure — your pins, and your own work —
   * so the headed sections below read as a separate list. A rule between every
   * section would only be noise; these two earn it.
   */
  dividerAfter?: boolean;
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
    // Workspace — the product, end to end. Its blocks are the phases in order:
    // what's mine → decide what to build → build it → verify it. The section
    // keys are the old area ids, so a collapse the user set survives the merge.
    id: 'workspace',
    labelKey: 'navarea.workspace',
    icon: 'home',
    path: '/',
    sections: [
      // Pinned entities, first thing in the panel. Filled from the API and
      // hidden when the user has pinned nothing.
      {
        key: 'favourites',
        headingKey: 'nav.favourites',
        items: [],
        dynamic: 'favourites',
        dividerAfter: true,
      },
      {
        // The lead group: no heading, because everything that is *mine* — what's
        // waiting on me, what I'm on today, who on my team is carrying what — is
        // where you start, not a block you go looking for. Always open, since
        // there's no heading to collapse it by.
        //
        // Three rows, not five. Inbox (what arrived) and My Team (everyone
        // else's work) are different questions; the three views *of my own
        // queue* nest under My Tasks, which is the one place a third level is
        // earned — same shape the classic menu has always drawn.
        key: 'home.mine',
        items: [
          { path: '/inbox', labelKey: 'nav.inbox', icon: 'inbox', badge: 'inbox' },
          {
            // A parent row is a toggle, never a link, so its path is only the
            // key the open/closed memory hangs on — its first child's, which is
            // also what `findNavItem` resolves for the breadcrumb.
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
          { path: '/my-team', labelKey: 'nav.myTeam', icon: 'people' },
        ],
        dividerAfter: true,
      },
      {
        // Discovery — decide what's worth building (the what & why).
        //
        // OKRs has no row of its own: it's a tab of the roadmaps page now, and a
        // second row for a tab would be the nav offering two doors into one
        // room. The row still owns `/okrs` (`alsoAt`), so it stays lit and stays
        // the breadcrumb whichever tab is open.
        key: 'discovery.main',
        headingKey: 'navarea.discovery',
        items: [
          { path: '/roadmaps', labelKey: 'nav.roadmaps', icon: 'roadmap', alsoAt: ['/okrs'] },
          { path: '/docs', labelKey: 'nav.docs', icon: 'docs' },
        ],
      },
      {
        // Teams — where the work is. Each team is a "space" with its own board,
        // statuses and cycles, and All issues leads them because it's the same
        // list unscoped: you widen from a team to everything, not the reverse.
        //
        // One block, not two. Teams used to have a heading of its own directly
        // under Delivery, which made "where the work is" read as two subjects and
        // spent a heading saying what the team rows already said. **Teams** is
        // what the block is now called, in the user's words — the rows are teams,
        // and the phase name was describing a block that had grown past it.
        //
        // The section key still reads `delivery.work`: it's the id the collapse
        // memory hangs on, so renaming it to match would silently re-open this
        // block for everyone who had closed it. Keys survive label changes — see
        // `NavSection.key`.
        key: 'delivery.work',
        headingKey: 'navgroup.teams',
        items: [{ path: '/issues', labelKey: 'nav.allIssues', icon: 'checks', end: true }],
        dynamic: 'teams',
      },
      {
        // Quality — verify it. Test projects and their reports, plus the
        // workspace's bugs seen as one list rather than per team board.
        key: 'quality.main',
        headingKey: 'navarea.quality',
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
    // Calendar — the same work as Home's My Tasks, laid out on days instead of in
    // columns. It earns a rail stop rather than a row inside Workspace because
    // "when is my week" is a different question from "what is on my list", asked
    // often enough to deserve one click.
    //
    // Its three rows are one page at three scopes, exactly as Quality's Bugs row
    // is the Issues board narrowed by `search`. Nothing is duplicated: the scope
    // rows carry `?source=`, so only the one matching the live URL lights up
    // (see `queryRowClaims`), and the toolbar's own toggle writes the same
    // param — the sidebar and the page can't disagree about what's shown.
    id: 'calendar',
    labelKey: 'navarea.calendar',
    icon: 'calendar',
    path: '/calendar',
    sections: [
      {
        key: 'calendar.main',
        items: [
          { path: '/calendar', labelKey: 'nav.mySchedule', icon: 'calendar', end: true },
          {
            path: '/calendar',
            search: 'source=personal',
            labelKey: 'nav.calendarPersonal',
            icon: 'user-list',
            end: true,
          },
          {
            path: '/calendar',
            search: 'source=assigned',
            labelKey: 'nav.calendarAssigned',
            icon: 'checks',
            end: true,
          },
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
          // Design patterns is a dev-time gallery, so the row exists only where
          // the page does — `npm run dev`. In a built app the route is gone too
          // (App.tsx), which is what keeps the menu from offering a dead link.
          ...(designPatternsEnabled
            ? [
                {
                  path: '/design-patterns',
                  labelKey: 'nav.designPatterns',
                  icon: 'sparkles',
                  adminOnly: true,
                } satisfies NavItem,
              ]
            : []),
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
 * Whether one of `peers` — the rows drawn beside this one — claims the live URL
 * *with its query*. A plain row on the same pathname then yields the highlight:
 * All issues and Bugs both point at `/issues`, and now that they share a panel,
 * two lit rows would be two answers to "where am I?".
 *
 * Peers are passed in rather than read from `NAV_AREAS`, because the classic
 * menu draws a different set — a row can only lose the highlight to a row the
 * user can actually see winning it.
 */
export function queryRowClaims(peers: NavItem[], pathname: string, search: string): boolean {
  return peers.some(
    (i) => i.search !== undefined && i.path === pathname && searchMatches(search, i.search),
  );
}

/**
 * How specifically a row claims `pathname` — the length of the matching route,
 * or `-1` for no claim. A row's routes are its `path` plus any `alsoAt`, each
 * matched exactly or as a prefix, so the answer is the same whichever of a
 * tabbed page's URLs you arrived on.
 */
function claimLength(item: NavItem, pathname: string): number {
  let best = -1;
  for (const p of [item.path, ...(item.alsoAt ?? [])]) {
    if (pathname === p || pathname.startsWith(`${p}/`)) best = Math.max(best, p.length);
  }
  return best;
}

/** Whether a row is exactly at `pathname` (not merely above it). */
function claimsExactly(item: NavItem, pathname: string): boolean {
  return item.path === pathname || !!item.alsoAt?.includes(pathname);
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
  const all = allItems().filter((i) => !i.search);
  const exact = all.find((i) => claimsExactly(i, pathname));
  if (exact) return exact;
  return all
    .map((i) => [i, claimLength(i, pathname)] as const)
    .filter(([, len]) => len >= 0)
    .sort(([, a], [, b]) => b - a)[0]?.[0];
}

/**
 * Routes that belong to an area no `NavItem` names. Teams are dynamic, and a
 * project-scoped bug board is only ever reached from a test report.
 */
const AREA_PREFIXES: [prefix: string, areaId: string][] = [
  ['/teams/', 'workspace'],
  ['/bugs', 'workspace'],
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
 * is both the Bugs row and the All issues board with its Tasks/Bugs toggle
 * flipped — the same URL, reached two ways. Only a claim from a *different*
 * area is a real contest, and a contest is "no opinion" so the rail doesn't jump
 * under either one. Both rows now live in Workspace, so the answer is the same
 * either way — the rule is kept for whatever splits across the rail next.
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
        const len = claimLength(item, pathname);
        if (len >= 0 && (!best || len > best.len)) best = { id: area.id, len };
      }
    }
  }
  // Contested across areas → nobody. Otherwise whichever row asked for it.
  if (searchOwner && best && searchOwner !== best.id) return undefined;
  if (best) return best.id;
  if (searchOwner) return searchOwner;

  return AREA_PREFIXES.find(([prefix]) => pathname.startsWith(prefix))?.[1];
}
