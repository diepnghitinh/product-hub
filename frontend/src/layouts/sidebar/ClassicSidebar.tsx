import { Fragment, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, MoreHorizontal, Plus, Star } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { NAV_GROUPS } from '@/layouts/sidebar/classicMenuConfig';
import { t } from '@/i18n';
import { useInbox } from '@/features/inbox/api';
import { useFavourites } from '@/features/favourites/api';
import { useTeams } from '@/features/teams/api';
import { CreateTeamDialog } from '@/features/teams/CreateTeamDialog';
import { ProfileMenu } from '@/layouts/sidebar/ProfileMenu';
import {
  ACTION,
  FavouriteNavItem,
  NavHeading,
  NavLeafItem,
  NavParentItem,
  ROW,
  SidebarCreateMenu,
  TeamNavList,
  useNavGroups,
  useNavSections,
} from '@/layouts/sidebar/navPrimitives';

const COLLAPSE_KEY = 'ph_nav_collapsed';

interface SidebarProps {
  /** Whether the mobile drawer is open. */
  mobileOpen: boolean;
  /** Close the mobile drawer (also fired on any nav click). */
  onCloseMobile: () => void;
}

/**
 * The **classic** side menu: one column, every section of the app stacked in it,
 * with a collapse to an icon-only rail. Chosen in Profile → Side menu; the
 * two-level rail + panel lives in `Sidebar.tsx`.
 *
 * Every row it renders comes from `navPrimitives`, the same file the two-level
 * menu draws from: this file owns the *shape* (one column, this order, this
 * collapse) and nothing about how a team, a favourite or a nav link looks or
 * behaves. Its model is `NAV_GROUPS`, not `NAV_AREAS` — flat groups instead of
 * areas is the whole difference between the two menus.
 *
 * Note the collapse: the *whole* menu narrows to icons here, which is why these
 * rows take `collapsed`. The two-level menu keeps its area rail and hides only
 * the panel, so it never needs an icon-only row. Both share `ph_nav_collapsed`,
 * so a collapsed menu stays collapsed across a switch.
 */
export function ClassicSidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { isAdmin, canManageDelivery } = useAuth();
  const navigate = useNavigate();
  const { data: inbox } = useInbox();
  const unseen = inbox?.unseenCount ?? 0;
  const { data: favourites } = useFavourites();
  // Teams are dynamic (QC/Engineering are seeded); archived ones drop out.
  const { pathname } = useLocation();
  const { data: teams } = useTeams();
  const activeTeams = (teams ?? []).filter((x) => !x.archived);

  const [creatingTeam, setCreatingTeam] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(COLLAPSE_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const { isOpen, toggleGroup } = useNavGroups();
  const { sectionOpen, toggleSection } = useNavSections();
  // A section's caret reflects its stored open state; its *body*, though, also shows
  // whenever the rail is collapsed to icons — there the headings (and their toggles)
  // are hidden, so section-collapse would otherwise strand items with no way back.
  const sectionBodyOpen = (key: string) => collapsed || sectionOpen(key);

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-[232px] flex-col border-r bg-sidebar text-sidebar-foreground shadow-xl transition-[width,transform] duration-200',
        'md:sticky md:top-0 md:z-30 md:translate-x-0 md:shadow-none',
        collapsed ? 'md:w-14' : 'md:w-[232px]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}
    >
      {/* Header — a bold workspace title, then the actions that act on the whole
          rail: collapse, and a create menu. Kept at h-12 so it lines up with the
          topbar's own row across the divide. */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-sidebar-border px-3">
        <Link
          to="/"
          onClick={onCloseMobile}
          className={cn(
            'flex min-w-0 items-center gap-1.5 text-[15px] font-semibold tracking-tight text-foreground',
            collapsed && 'md:hidden',
          )}
        >
          <span className="shrink-0 text-base text-primary" aria-hidden>
            ◑
          </span>
          <span className="truncate">{t('app.name')}</span>
        </Link>

        <div className={cn('flex items-center gap-0.5', collapsed ? 'md:mx-auto' : 'ml-auto')}>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            className="hidden size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:grid"
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </button>

          <span className={cn(collapsed && 'md:hidden')}>
            <SidebarCreateMenu onNewTeam={() => setCreatingTeam(true)} onNavigate={onCloseMobile} />
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
        {/* Favourites — the user's pinned entities, first thing in the rail.
            Hidden when there are none; each row links straight to its item. */}
        {favourites && favourites.length > 0 && (
          <>
            <div className="flex flex-col gap-0.5">
              <NavHeading
                label={t('nav.favourites')}
                icon={<Star className="size-3.5" aria-hidden />}
                open={sectionOpen('favourites')}
                onToggle={() => toggleSection('favourites')}
                className={cn(collapsed && 'md:hidden')}
              />
              {sectionBodyOpen('favourites') &&
                favourites.map((fav) => (
                  <FavouriteNavItem
                    key={`${fav.kind}:${fav.refId}`}
                    fav={fav}
                    collapsed={collapsed}
                    onNavigate={onCloseMobile}
                  />
                ))}
            </div>
            <div className={cn('mx-2 border-t border-sidebar-border', collapsed && 'md:mx-1')} />
          </>
        )}
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.adminOnly || isAdmin);
          if (items.length === 0) return null;
          // The top group is the primary nav — headingless, like a home column —
          // and a divider closes it off from the titled sections below.
          const isPrimary = group.headingKey === 'navgroup.overview';
          return (
            <Fragment key={group.headingKey}>
              <div className="flex flex-col gap-0.5">
                {!isPrimary && (
                  <NavHeading
                    label={t(group.headingKey)}
                    open={sectionOpen(group.headingKey)}
                    onToggle={() => toggleSection(group.headingKey)}
                    className={cn(collapsed && 'md:hidden')}
                  />
                )}
                {/* The headingless primary group has no toggle, so it always shows. */}
                {(isPrimary || sectionBodyOpen(group.headingKey)) &&
                  items.map((item) =>
                    item.children && !collapsed ? (
                      <NavParentItem
                        key={item.path}
                        item={item}
                        // Standing on any of its views keeps the group open.
                        open={isOpen(item.path, item.children.map((c) => c.path))}
                        onToggle={() => toggleGroup(item.path, item.children!.map((c) => c.path))}
                        onNavigate={onCloseMobile}
                      />
                    ) : (
                      <NavLeafItem
                        key={item.path}
                        item={item}
                        collapsed={collapsed}
                        unseen={unseen}
                        onNavigate={onCloseMobile}
                      />
                    ),
                  )}
              </div>

              {isPrimary && (
                <div className={cn('mx-2 border-t border-sidebar-border', collapsed && 'md:mx-1')} />
              )}

              {/* Teams sit right under Delivery — each is an area with its own
                  issue list (QC → bugs, Engineering → tasks), rendered like a
                  workspace's "spaces". */}
              {group.headingKey === 'navgroup.delivery' && activeTeams.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <NavHeading
                    label={t('navgroup.teams')}
                    open={sectionOpen('teams')}
                    onToggle={() => toggleSection('teams')}
                    className={cn(collapsed && 'md:hidden')}
                    actions={
                      // `⋯` opens the page that owns teams and is revealed only while
                      // the heading row is hovered (the group/heading scope lives on
                      // NavHeading's row, not the team rows below). `+` adds a team and
                      // stays visible as the primary action. Both gated on
                      // canManageDelivery, matching the team endpoints' @Roles(ADMIN,
                      // PRODUCT) — the gates must agree or an affordance silently
                      // vanishes for Product.
                      canManageDelivery ? (
                        <span className="flex items-center gap-0.5">
                          <Link
                            to="/admin/settings"
                            onClick={onCloseMobile}
                            title={t('navgroup.teamsSettings')}
                            aria-label={t('navgroup.teamsSettings')}
                            className={cn(ACTION, 'group-hover/heading:opacity-100')}
                          >
                            <MoreHorizontal className="size-3.5" aria-hidden />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setCreatingTeam(true)}
                            title={t('teams.add')}
                            aria-label={t('teams.add')}
                            className={cn(ACTION, 'opacity-100')}
                          >
                            <Plus className="size-3.5" aria-hidden />
                          </button>
                        </span>
                      ) : undefined
                    }
                  />
                  {sectionBodyOpen('teams') && (
                    <>
                      <TeamNavList
                        teams={activeTeams}
                        collapsed={collapsed}
                        pathname={pathname}
                        onNavigate={onCloseMobile}
                        isOpen={isOpen}
                        onToggle={toggleGroup}
                      />
                      {/* A quiet "add another" foot to the list — the same create the
                          heading's `+` runs, but where the eye lands after reading the
                          spaces. Mirrors a workspace's "+ New Space". */}
                      {canManageDelivery && !collapsed && (
                        <button
                          type="button"
                          onClick={() => setCreatingTeam(true)}
                          className={cn(ROW, 'text-muted-foreground')}
                        >
                          <span className="grid size-5 shrink-0 place-items-center">
                            <Plus className="size-4" />
                          </span>
                          <span className="truncate">{t('nav.newTeam')}</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </Fragment>
          );
        })}
      </nav>

      {/* Footer — the signed-in user's menu: avatar → appearance, side menu,
          links, sign out. `'md'` because this menu's drawer below md is full
          width and has room for the name; only the desktop rail narrows. */}
      <ProfileMenu compact={collapsed ? 'md' : undefined} onCloseMobile={onCloseMobile} />

      {/* Opening the new team's board is the confirmation — it proves the team
          exists and lands you where you'd go next anyway. */}
      <CreateTeamDialog
        open={creatingTeam}
        onClose={() => setCreatingTeam(false)}
        onCreated={(team) => {
          navigate(`/teams/${team.id}`);
          onCloseMobile();
        }}
      />
    </aside>
  );
}
