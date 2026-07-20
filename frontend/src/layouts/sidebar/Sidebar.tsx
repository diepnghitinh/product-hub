import { Fragment, useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { Menu } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { cn } from '@/lib/utils';
import { NAV_GROUPS, PROFILE_NAV_ITEMS, type NavItem } from '@/layouts/sidebar/menuConfig';
import { t } from '@/i18n';
import { ROLE_LABEL } from '@/types/enums';
import { useInbox } from '@/features/inbox/api';
import { useTeams } from '@/features/teams/api';
import { TeamIconPicker } from '@/features/teams/TeamIconPicker';
import { CreateTeamDialog } from '@/features/teams/CreateTeamDialog';
import { ChangePasswordDialog } from '@/features/account/ChangePasswordDialog';
import type { TeamDto } from '@/types/dto';

const COLLAPSE_KEY = 'ph_nav_collapsed';
const EXPAND_KEY = 'ph_nav_expanded';

/**
 * A hover-revealed action on a nav heading or row (`+`, `⋯`). Invisible until its
 * group is hovered — and always visible below `md`, where there is no hover at all.
 * The caller adds the matching `group-hover/*` variant, which is the only part that
 * differs between the heading and a team row.
 */
const ACTION =
  'grid size-4 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 max-md:opacity-100';

function initials(name: string, email: string): string {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

interface SidebarProps {
  /** Whether the mobile drawer is open. */
  mobileOpen: boolean;
  /** Close the mobile drawer (also fired on any nav click). */
  onCloseMobile: () => void;
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { user, logout, isAdmin, canManageDelivery } = useAuth();
  const { toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { data: inbox } = useInbox();
  const unseen = inbox?.unseenCount ?? 0;
  // Teams are dynamic (QC/Engineering are seeded); archived ones drop out.
  const { pathname } = useLocation();
  const { data: teams } = useTeams();
  const activeTeams = (teams ?? []).filter((x) => !x.archived);

  const [creatingTeam, setCreatingTeam] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
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

  function onLogout() {
    logout();
    navigate('/login');
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-[216px] flex-col border-r bg-sidebar text-sidebar-foreground shadow-xl transition-[width,transform] duration-200',
        'md:sticky md:top-0 md:z-30 md:translate-x-0 md:shadow-none',
        collapsed ? 'md:w-14' : 'md:w-[216px]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}
    >
      {/* Brand row */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-2.5">
        <Link
          to="/"
          onClick={onCloseMobile}
          className={cn(
            'flex items-center gap-1.5 overflow-hidden text-sm font-semibold tracking-tight',
            collapsed && 'md:hidden',
          )}
        >
          <span className="shrink-0 text-base text-primary">◑</span>
          <span className="truncate">{t('app.name')}</span>
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          className={cn(
            'hidden size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:grid',
            collapsed ? 'md:mx-auto' : 'ml-auto',
          )}
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={14} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-3 overflow-y-auto p-2">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.adminOnly || isAdmin);
          if (items.length === 0) return null;
          return (
            <Fragment key={group.headingKey}>
            <div className="flex flex-col gap-0.5">
              <span
                className={cn(
                  'flex items-center gap-1 px-2 pb-0.5 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground',
                  collapsed && 'md:hidden',
                )}
              >
                {t(group.headingKey)}
              </span>
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

            {/* Teams sit right under Delivery — each is an area with its own
                issue list (QC → bugs, Engineering → tasks). */}
            {group.headingKey === 'navgroup.delivery' && activeTeams.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <span
                  className={cn(
                    'group/heading flex items-center gap-1 px-2 pb-0.5 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground',
                    collapsed && 'md:hidden',
                  )}
                >
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
                        <MoreHorizontal className="size-3" aria-hidden />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setCreatingTeam(true)}
                        title={t('teams.add')}
                        aria-label={t('teams.add')}
                        className={cn(ACTION, 'opacity-100')}
                      >
                        <Plus className="size-3" aria-hidden />
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
              </div>
            )}
            </Fragment>
          );
        })}
      </nav>

      {/* Footer user menu */}
      {user && (
        <div className="shrink-0 border-t border-sidebar-border p-2">
          <Menu
            up
            align="left"
            triggerClassName="w-full"
            trigger={
              <span
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-sidebar-accent',
                  collapsed && 'md:justify-center',
                )}
              >
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
                  aria-hidden
                >
                  {initials(user.name, user.email)}
                </span>
                <span
                  className={cn(
                    'flex min-w-0 flex-col leading-tight',
                    collapsed && 'md:hidden',
                  )}
                >
                  <span className="truncate text-[13px] font-medium text-foreground">
                    {user.name}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {ROLE_LABEL[user.role]}
                  </span>
                </span>
              </span>
            }
            items={[
              // People + Settings moved here from the sidebar's Admin group.
              // `closeOnSelect` so the menu dismisses when we navigate away.
              ...PROFILE_NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin).map((i) => ({
                label: t(i.labelKey),
                closeOnSelect: true,
                onClick: () => {
                  navigate(i.path);
                  onCloseMobile();
                },
              })),
              { label: t('theme.toggle'), onClick: toggleTheme },
              { label: t('account.changePassword'), onClick: () => setChangingPassword(true) },
              {
                label: t('nav.designPatterns'),
                onClick: () => {
                  navigate('/design-patterns');
                  onCloseMobile();
                },
              },
              { label: t('nav.signOut'), onClick: onLogout, danger: true },
            ]}
          />
        </div>
      )}

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

      <ChangePasswordDialog
        open={changingPassword}
        onClose={() => setChangingPassword(false)}
      />
    </aside>
  );
}

/**
 * A team in the nav. The symbol is a picker in place (admin/product only) — so
 * it's a real button and can't live inside the row's <a>; the name is the link
 * instead. Collapsed, the icon is the only hit target, so it stays pure
 * navigation and the picker is suppressed.
 */
/** A single nav row (leaf link). Renders the current user's avatar instead of an
 * icon when `item.avatar` is set — the "Assigned to me" child. */
function NavLeafItem({
  item,
  collapsed,
  unseen,
  onNavigate,
  indent = false,
}: {
  item: NavItem;
  collapsed: boolean;
  unseen: number;
  onNavigate: () => void;
  indent?: boolean;
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
          'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
          collapsed && 'md:justify-center md:gap-0',
          indent && 'ml-3.5',
        )
      }
    >
      <span className="grid size-4 shrink-0 place-items-center">
        {item.avatar && user ? (
          <span
            className="grid size-4 place-items-center rounded-full bg-primary text-[8px] font-semibold text-primary-foreground"
            aria-hidden
          >
            {initials(user.name, user.email)}
          </span>
        ) : (
          <Icon name={item.icon} size={16} />
        )}
      </span>
      <span className={cn('flex-1 truncate', collapsed && 'md:hidden')}>{t(item.labelKey)}</span>
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
    </NavLink>
  );
}

/** A collapsible nav parent (e.g. My Tasks): the row toggles its children; a
 * rotated chevron shows state. Only rendered when the sidebar is expanded. */
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
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <span className="grid size-4 shrink-0 place-items-center">
          <Icon name={item.icon} size={16} />
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
        <div className="flex flex-col gap-0.5">
          {item.children!.map((c) => (
            <NavLeafItem
              key={`${c.path}:${c.labelKey}`}
              item={c}
              collapsed={false}
              unseen={0}
              onNavigate={onNavigate}
              indent
            />
          ))}
        </div>
      )}
    </div>
  );
}

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

  const row = cn(
    'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors',
    active && 'bg-sidebar-accent text-sidebar-accent-foreground',
    collapsed && 'md:justify-center md:gap-0',
  );

  if (!editable) {
    return (
      <NavLink
        to={`/teams/${team.id}`}
        onClick={onNavigate}
        title={collapsed ? team.name : undefined}
        className={cn(row, 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground')}
      >
        <TeamIconPicker team={team} readOnly className="shrink-0" />
        <span className={cn('flex-1 truncate', collapsed && 'md:hidden')}>{team.name}</span>
      </NavLink>
    );
  }

  return (
    <div className={cn(row, 'group/team hover:bg-sidebar-accent hover:text-sidebar-accent-foreground')}>
      <TeamIconPicker team={team} className="-my-0.5" />
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
        <MoreHorizontal className="size-3" aria-hidden />
      </Link>
    </div>
  );
}
