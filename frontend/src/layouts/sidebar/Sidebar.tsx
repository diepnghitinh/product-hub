import { Fragment, useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronsLeft, ChevronsRight, MoreHorizontal, Plus, Star, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Menu } from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/format';
import { NAV_GROUPS, type NavItem } from '@/layouts/sidebar/menuConfig';
import { t } from '@/i18n';
import { FAVOURITE_KIND_LABEL, FavouriteKind } from '@/types/enums';
import { useInbox } from '@/features/inbox/api';
import { useFavourites, useRemoveFavourite } from '@/features/favourites/api';
import { useTeams } from '@/features/teams/api';
import { TeamIconPicker } from '@/features/teams/TeamIconPicker';
import { CreateTeamDialog } from '@/features/teams/CreateTeamDialog';
import { ProfileMenu } from '@/layouts/sidebar/ProfileMenu';
import type { FavouriteDto, TeamDto } from '@/types/dto';

const COLLAPSE_KEY = 'ph_nav_collapsed';
const EXPAND_KEY = 'ph_nav_expanded';

/**
 * A hover-revealed action on a nav heading or row (`+`, `⋯`). Invisible until its
 * group is hovered — and always visible below `md`, where there is no hover at all.
 * The caller adds the matching `group-hover/*` variant, which is the only part that
 * differs between the heading and a team row. Hovering the action itself fills a
 * rounded rectangle with the sidebar accent, so it reads as a real icon button.
 */
const ACTION =
  'grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-[opacity,background-color,color] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:opacity-100 max-md:opacity-100';

/**
 * The shared shape of a nav row (leaf link, collapsible parent, team, ghost add).
 * Every row is the same height and rhythm — icon slot, label, optional trailing —
 * so the whole rail reads as one list however a given row behaves.
 */
const ROW =
  'group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';

/** A section label (Product Discovery, Teams…): quiet, Title-Case, gently spaced. */
const HEADING =
  'flex items-center gap-1 px-2 pb-1 pt-0.5 text-xs font-medium text-muted-foreground';

interface SidebarProps {
  /** Whether the mobile drawer is open. */
  mobileOpen: boolean;
  /** Close the mobile drawer (also fired on any nav click). */
  onCloseMobile: () => void;
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
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

  // Which collapsible nav parents (e.g. My Tasks) are open. Persisted; a parent
  // auto-opens when you're on one of its routes.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(EXPAND_KEY) || '{}');
    } catch {
      return {};
    }
  });
  useEffect(() => {
    localStorage.setItem(EXPAND_KEY, JSON.stringify(openGroups));
  }, [openGroups]);
  const isUnder = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  const isOpen = (p: string) => openGroups[p] ?? isUnder(p);
  const toggleGroup = (p: string) =>
    setOpenGroups((g) => ({ ...g, [p]: !(g[p] ?? isUnder(p)) }));

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

          {/* Create — the rail's one primary action, styled as a real button to
              stand out from the flat rows. Offers only what the app can truly
              create right now (a task; a space, for those who may add one). */}
          <span className={cn(collapsed && 'md:hidden')}>
            <Menu
              align="right"
              trigger={
                <span
                  className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-foreground shadow-sm transition-colors hover:bg-accent"
                  title={t('nav.create')}
                  aria-label={t('nav.create')}
                >
                  <Plus className="size-4" />
                  <ChevronDown className="size-3 text-muted-foreground" />
                </span>
              }
              items={[
                {
                  label: t('tasks.new'),
                  icon: <Icon name="tasks" size={16} />,
                  closeOnSelect: true,
                  onClick: () => {
                    navigate('/tasks/new');
                    onCloseMobile();
                  },
                },
                ...(canManageDelivery
                  ? [
                      {
                        label: t('nav.newTeam'),
                        icon: <Plus className="size-4" />,
                        closeOnSelect: true,
                        onClick: () => setCreatingTeam(true),
                      },
                    ]
                  : []),
              ]}
            />
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
              <span className={cn(HEADING, collapsed && 'md:hidden')}>
                <Star className="size-3.5" aria-hidden />
                {t('nav.favourites')}
              </span>
              {favourites.map((fav) => (
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
                  <span className={cn(HEADING, collapsed && 'md:hidden')}>{t(group.headingKey)}</span>
                )}
                {items.map((item) =>
                  item.children && !collapsed ? (
                    <NavParentItem
                      key={item.path}
                      item={item}
                      open={isOpen(item.path)}
                      onToggle={() => toggleGroup(item.path)}
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
                  <span className={cn(HEADING, 'group/heading', collapsed && 'md:hidden')}>
                    {t('navgroup.teams')}
                    {/* The section's two actions. `⋯` opens the page that owns teams
                        and is revealed only while the heading row itself is hovered —
                        the group scope is this span, not the whole section, so hovering
                        a team row below never surfaces it. `+` adds a team and stays
                        visible always, since it's the primary action and needs no
                        discovery. Both gated on `canManageDelivery`, matching each team
                        row's own overflow below and the backend's @Roles(ADMIN, PRODUCT)
                        on the team endpoints — the gates must agree or an affordance
                        silently vanishes for Product. */}
                    {canManageDelivery && (
                      <span className="ml-auto flex items-center gap-0.5">
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
                    )}
                  </span>
                  {activeTeams.map((team) => (
                    <TeamNavItem
                      key={team.id}
                      team={team}
                      collapsed={collapsed}
                      active={pathname === `/teams/${team.id}`}
                      onNavigate={onCloseMobile}
                    />
                  ))}
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
                </div>
              )}
            </Fragment>
          );
        })}
      </nav>

      {/* Footer — the signed-in user's menu: avatar → appearance, links, sign out. */}
      <ProfileMenu collapsed={collapsed} onCloseMobile={onCloseMobile} />

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

/** A single nav row (leaf link). Renders the current user's avatar instead of an
 * icon when `item.avatar` is set — the "Assigned to me" child. The icon rides a
 * shade quieter than its label, catching up to it on hover/active. */
function NavLeafItem({
  item,
  collapsed,
  unseen,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  unseen: number;
  onNavigate: () => void;
}) {
  const { user } = useAuth();
  return (
    <NavLink
      to={item.path}
      end={item.end}
      onClick={onNavigate}
      title={collapsed ? t(item.labelKey) : undefined}
      className={({ isActive }) =>
        cn(
          ROW,
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
          collapsed && 'md:justify-center md:gap-0',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'grid size-5 shrink-0 place-items-center transition-colors',
              isActive
                ? 'text-sidebar-accent-foreground'
                : 'text-muted-foreground group-hover:text-sidebar-accent-foreground',
            )}
          >
            {item.avatar && user ? (
              <span
                className="grid size-5 place-items-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground"
                aria-hidden
              >
                {initials(user.name, user.email)}
              </span>
            ) : (
              <Icon name={item.icon} size={18} />
            )}
          </span>
          <span className={cn('flex-1 truncate', collapsed && 'md:hidden')}>
            {t(item.labelKey)}
          </span>
          {item.badge === 'inbox' && unseen > 0 && (
            <span
              className={cn(
                'ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground',
                collapsed && 'md:hidden',
              )}
            >
              {unseen}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

/** A collapsible nav parent (e.g. My Tasks): the row toggles its children; a
 * rotated chevron shows state. Children hang off a left guide line, the way a
 * space's lists nest. Only rendered when the sidebar is expanded. */
function NavParentItem({
  item,
  open,
  onToggle,
  onNavigate,
}: {
  item: NavItem;
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <button type="button" onClick={onToggle} aria-expanded={open} className={ROW}>
        <span className="grid size-5 shrink-0 place-items-center text-muted-foreground transition-colors group-hover:text-sidebar-accent-foreground">
          <Icon name={item.icon} size={18} />
        </span>
        <span className="flex-1 truncate text-left">{t(item.labelKey)}</span>
        <Icon
          name="chevron-right"
          size={14}
          className={cn(
            'shrink-0 text-muted-foreground/70 transition-transform',
            open && 'rotate-90',
          )}
        />
      </button>
      {open && (
        <div className="ml-[18px] flex flex-col gap-0.5 border-l border-sidebar-border pl-2.5">
          {item.children!.map((c) => (
            <NavLeafItem
              key={`${c.path}:${c.labelKey}`}
              item={c}
              collapsed={false}
              unseen={0}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A team in the nav — a workspace "space". The symbol is a picker in place
 * (admin/product only) — so it's a real button and can't live inside the row's
 * <a>; the name is the link instead. Collapsed, the icon is the only hit target,
 * so it stays pure navigation and the picker is suppressed.
 */
function TeamNavItem({
  team,
  collapsed,
  active,
  onNavigate,
}: {
  team: TeamDto;
  collapsed: boolean;
  active: boolean;
  onNavigate: () => void;
}) {
  const { canManageDelivery } = useAuth();
  const editable = canManageDelivery && !collapsed;

  const row = cn(ROW, active && 'bg-sidebar-accent text-sidebar-accent-foreground', collapsed && 'md:justify-center md:gap-0');

  if (!editable) {
    return (
      <NavLink
        to={`/teams/${team.id}`}
        onClick={onNavigate}
        title={collapsed ? team.name : undefined}
        className={row}
      >
        <span className="grid size-5 shrink-0 place-items-center">
          <TeamIconPicker team={team} size={18} readOnly />
        </span>
        <span className={cn('flex-1 truncate', collapsed && 'md:hidden')}>{team.name}</span>
      </NavLink>
    );
  }

  return (
    <div className={cn(row, 'group/team')}>
      <span className="grid size-5 shrink-0 place-items-center">
        <TeamIconPicker team={team} size={18} className="-my-0.5" />
      </span>
      <Link to={`/teams/${team.id}`} onClick={onNavigate} className="min-w-0 flex-1 truncate">
        {team.name}
      </Link>
      {/* This team's own settings — where its board columns (statuses) are
          owned, since a board can't add one. Revealed on hover, like the
          section overflow above; always shown on touch, where there is no hover. */}
      <Link
        to={`/admin/settings?tab=team:${team.id}`}
        onClick={onNavigate}
        title={t('teams.settings').replace('{team}', team.name)}
        aria-label={t('teams.settings').replace('{team}', team.name)}
        className={cn(ACTION, 'group-hover/team:opacity-100')}
      >
        <MoreHorizontal className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}

/** Icon per favourite kind — reuses the same glyphs as the nav/boards. */
const FAV_ICON: Record<FavouriteKind, IconName> = {
  [FavouriteKind.BUG]: 'bug',
  [FavouriteKind.TASK]: 'tasks',
  [FavouriteKind.ROADMAP_ITEM]: 'roadmap',
};

/** Where a pinned entity opens. A roadmap item deep-links to its board + dialog. */
function favouriteHref(fav: FavouriteDto): string {
  switch (fav.kind) {
    case FavouriteKind.BUG:
      return `/bugs/${fav.refId}`;
    case FavouriteKind.TASK:
      return `/tasks/${fav.refId}`;
    case FavouriteKind.ROADMAP_ITEM:
      return fav.roadmapId ? `/roadmaps/${fav.roadmapId}/items/${fav.refId}` : '/roadmaps';
    default:
      return '/';
  }
}

/**
 * One pinned entity in the sidebar. Expanded, it's an icon + title with a hover
 * "unpin" (×) — the symbol is a real button, so like a team row the label is a
 * separate <Link>. Collapsed, the icon alone links and the unpin is suppressed.
 */
function FavouriteNavItem({
  fav,
  collapsed,
  onNavigate,
}: {
  fav: FavouriteDto;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const remove = useRemoveFavourite();
  const to = favouriteHref(fav);
  const label = fav.title || FAVOURITE_KIND_LABEL[fav.kind];

  if (collapsed) {
    return (
      <NavLink
        to={to}
        onClick={onNavigate}
        title={label}
        className={({ isActive }) =>
          cn(
            ROW,
            'md:justify-center md:gap-0',
            isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
          )
        }
      >
        <span className="grid size-5 shrink-0 place-items-center text-muted-foreground">
          <Icon name={FAV_ICON[fav.kind]} size={18} />
        </span>
      </NavLink>
    );
  }

  return (
    <div className={cn(ROW, 'group/fav')}>
      <span className="grid size-5 shrink-0 place-items-center text-muted-foreground transition-colors group-hover/fav:text-sidebar-accent-foreground">
        <Icon name={FAV_ICON[fav.kind]} size={18} />
      </span>
      <Link to={to} onClick={onNavigate} className="min-w-0 flex-1 truncate" title={label}>
        {label}
      </Link>
      <button
        type="button"
        onClick={() => remove.mutate({ kind: fav.kind, refId: fav.refId })}
        title={t('fav.unpin')}
        aria-label={t('fav.unpin')}
        className={cn(ACTION, 'group-hover/fav:opacity-100')}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
