import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { CalendarClock, ChevronDown, CircleDot, MoreHorizontal, Plus, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Menu } from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/format';
import { searchMatches, type NavArea, type NavItem } from '@/layouts/sidebar/menuConfig';
import { t } from '@/i18n';
import { FAVOURITE_KIND_LABEL, FavouriteKind } from '@/types/enums';
import { useRemoveFavourite } from '@/features/favourites/api';
import { TeamIconPicker } from '@/features/teams/TeamIconPicker';
import type { FavouriteDto, TeamDto } from '@/types/dto';

/**
 * Every row the sidebar can render, and the state that remembers what's open.
 *
 * A sidebar owns the shape and none of the parts: a rail button, a team row, a
 * favourite, a nav link and a section heading all live here, so how they look and
 * behave is decided in one place. Style one from the page that renders it and the
 * two go out of step.
 *
 * **Both menus render from this file** — `Sidebar` (icon rail + panel) and
 * `ClassicSidebar` (one stacked column). That's deliberate: a fix to the team
 * row's drag, or to how a favourite unpins, has to reach whichever menu the user
 * has chosen, and one copy is the only way that's true.
 *
 * The rows differ in exactly one respect, the optional `collapsed` prop: the
 * classic menu collapses to an *icon rail*, so its rows drop their labels from
 * `md` up. The two-level menu never passes it — collapsing there hides the whole
 * panel and leaves the area rail behind, so its rows are only ever full width.
 */

/** Which collapsible nav parents (e.g. a cycles-enabled team) are open. */
const EXPAND_KEY = 'ph_nav_expanded';
/**
 * Which whole *sections* (Favourites, a nav group, Teams) the user has collapsed,
 * keyed by a stable section id. Local to this browser like the keys around it, and
 * stores only the ones explicitly closed — so a fresh rail shows every section open.
 */
const SECTIONS_KEY = 'ph_nav_sections';
/**
 * Personalisation: the order the teams sit in *this* sidebar, saved by id. Local
 * to the browser like the collapse/expand state above — so one member rearranging
 * their sidebar never reorders anyone else's. Teams not listed here (newly added)
 * fall in by their natural `order` until they're dragged.
 */
const TEAMS_ORDER_KEY = 'ph_nav_team_order';
/**
 * Which level-1 area's panel is open. Personal to the browser like the keys
 * above — the point is that the app reopens in the area you were last working in.
 */
const AREA_KEY = 'ph_nav_area';

/**
 * A hover-revealed action on a nav heading or row (`+`, `⋯`). Invisible until its
 * group is hovered — and always visible below `md`, where there is no hover at all.
 * The caller adds the matching `group-hover/*` variant, which is the only part that
 * differs between the heading and a team row. Hovering the action itself fills a
 * rounded rectangle with the sidebar accent, so it reads as a real icon button.
 */
export const ACTION =
  'grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-[opacity,background-color,color] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:opacity-100 max-md:opacity-100';

/**
 * The shared shape of a nav row (leaf link, collapsible parent, team, ghost add).
 * Every row is the same height and rhythm — icon slot, label, optional trailing —
 * so the whole sidebar reads as one list however a given row behaves.
 */
export const ROW =
  'group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';

/** A section label (Product Discovery, Teams…): quiet, Title-Case, gently spaced. */
export const HEADING =
  'flex items-center gap-1 px-2 pb-1 pt-0.5 text-xs font-medium text-muted-foreground';

/**
 * A cell on the sidebar's bottom edge — the rail's collapse toggle, the profile.
 * `h-12`, the same as the header row at the top and as the doc tree's own
 * "+ Add page" footer beside it, so the rule above them is one continuous line
 * across all three columns instead of three heights meeting at a ragged edge.
 *
 * The cell fixes the height; whatever sits inside it is sized to fit (the
 * profile's two-line name block is 30px, so it rides in a 36px trigger).
 */
export const NAV_FOOTER_CELL =
  'flex h-12 shrink-0 items-center border-t border-sidebar-border px-2';

/**
 * Collapsible **parents** (Issues, a cycles-enabled team) — keyed by route, so a
 * parent auto-opens when you're standing on one of its children and the choice
 * survives a reload.
 */
export function useNavGroups() {
  const { pathname } = useLocation();
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
  /**
   * Where a group sits before anyone touches it: open whenever the route is
   * inside it. A parent row can live at a different URL from the child you're
   * standing on (My Tasks is `/issues/me`, but Today is `/issues/today`), so the
   * children count as "inside" too — otherwise the group would close under you.
   * Both `isOpen` and `toggleGroup` read it, or the first click after landing on
   * a child would only re-assert what's already on screen and look like a no-op.
   */
  const defaultOpen = (p: string, childPaths: string[]) => [p, ...childPaths].some(isUnder);
  return {
    isOpen: (p: string, childPaths: string[] = []) => openGroups[p] ?? defaultOpen(p, childPaths),
    toggleGroup: (p: string, childPaths: string[] = []) =>
      setOpenGroups((g) => ({ ...g, [p]: !(g[p] ?? defaultOpen(p, childPaths)) })),
  };
}

/**
 * Collapsible **sections** (Favourites, a nav group, Teams). Only the explicitly
 * closed ones are stored, so every section defaults open — including any section
 * added to the app later.
 */
export function useNavSections() {
  const [closedSections, setClosedSections] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(SECTIONS_KEY) || '{}');
    } catch {
      return {};
    }
  });
  useEffect(() => {
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(closedSections));
  }, [closedSections]);

  return {
    sectionOpen: (key: string) => !closedSections[key],
    toggleSection: (key: string) =>
      setClosedSections((s) => ({ ...s, [key]: !s[key] })),
  };
}

/**
 * Which area (level 1) the panel is showing, and how it follows the route.
 *
 * The route wins whenever it has an opinion: opening a doc from a link, or
 * jumping via a breadcrumb, moves the rail with you. `findAreaId` deliberately
 * returns nothing for routes that belong to no area — the dashboard, `/profile`,
 * the create pages — and the panel then stays put. That's what makes the
 * remembered area useful: reloading onto `/` reopens the area you were last in,
 * so a team board stays one click away instead of two.
 */
export function useSelectedArea(routeAreaId: string | undefined, fallbackId: string) {
  const [selected, setSelected] = useState<string>(
    () => localStorage.getItem(AREA_KEY) || routeAreaId || fallbackId,
  );
  useEffect(() => {
    localStorage.setItem(AREA_KEY, selected);
  }, [selected]);
  useEffect(() => {
    if (routeAreaId) setSelected(routeAreaId);
  }, [routeAreaId]);
  return [selected, setSelected] as const;
}

/**
 * One stop on the level-1 rail: a glyph, a micro-label under it, and an edge bar
 * marking the area you're in — readable from the periphery at 68px wide, which a
 * tinted tile alone isn't.
 *
 * It's a link, not a tab: every area has a real landing page, so clicking one
 * both opens its panel and takes you somewhere. An area that only revealed a
 * panel would be a control the user has to click twice to get anything from.
 */
export function RailButton({
  area,
  active,
  onSelect,
}: {
  area: NavArea;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <Link
      to={area.path}
      onClick={onSelect}
      title={t(area.labelKey)}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'group relative flex w-full flex-col items-center gap-1 rounded-lg py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'text-primary' : 'text-muted-foreground hover:text-sidebar-accent-foreground',
      )}
    >
      <span
        className={cn(
          'absolute inset-y-1 -left-2 w-[3px] rounded-r-full bg-primary transition-opacity',
          active ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden
      />
      <span
        className={cn(
          'grid size-9 place-items-center rounded-lg transition-colors',
          active ? 'bg-primary/10' : 'group-hover:bg-sidebar-accent',
        )}
      >
        <Icon name={area.icon} size={20} />
      </span>
      <span
        className={cn(
          'max-w-full truncate text-[10px] leading-none tracking-tight',
          active && 'font-semibold',
        )}
      >
        {t(area.labelKey)}
      </span>
    </Link>
  );
}

/**
 * The sidebar's one primary action, styled as a real button so it stands out
 * from the flat rows around it. Offers only what the app can truly create right
 * now — a task, and a space for those allowed to add one.
 *
 * Sits in the sidebar header, beside the workspace name.
 */
export function SidebarCreateMenu({
  onNewTeam,
  onNavigate,
}: {
  onNewTeam: () => void;
  onNavigate: () => void;
}) {
  const { canManageDelivery } = useAuth();
  const navigate = useNavigate();
  return (
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
            onNavigate();
          },
        },
        ...(canManageDelivery
          ? [
              {
                label: t('nav.newTeam'),
                icon: <Plus className="size-4" />,
                closeOnSelect: true,
                onClick: onNewTeam,
              },
            ]
          : []),
      ]}
    />
  );
}

/**
 * A collapsible **section** heading (Favourites, a nav group, Teams). The label and
 * a rotating caret form one toggle button; optional `actions` (Teams' ⋯/+) ride at
 * the far right *outside* that button so they stay independently clickable — a
 * button can't nest a link. Mirrors {@link NavParentItem}'s caret one level up.
 * `HEADING`'s `group/heading` scope stays on the outer row, so hover-revealed
 * actions surface for the heading only, not the section's rows below. Rendered on
 * the labelled sidebar; the icon rail hides it (and force-shows every section body).
 */
export function NavHeading({
  label,
  icon,
  open,
  onToggle,
  actions,
  className,
}: {
  label: string;
  icon?: ReactNode;
  open: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(HEADING, 'group/heading', className)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-w-0 flex-1 items-center gap-1 rounded text-left transition-colors hover:text-foreground"
      >
        <Icon
          name="chevron-right"
          size={12}
          className={cn(
            'shrink-0 text-muted-foreground/50 transition-transform',
            open && 'rotate-90',
          )}
        />
        {icon}
        <span className="truncate">{label}</span>
      </button>
      {actions}
    </div>
  );
}

/**
 * Whether a `search` row overrides what `NavLink` would decide — `undefined`
 * leaves `NavLink`'s own pathname match alone, which is every other row.
 *
 * `NavLink` can't see a query, so Bugs (`/issues?kind=bug`) would light up on
 * plain `/issues` too. It only ever *narrows* the match: All Issues keeps its
 * highlight while the board's own Tasks/Bugs toggle is on, because the row is
 * still where the user is, and the two rows sit in different panels anyway.
 */
function useQueryActive(item: NavItem): boolean | undefined {
  const { pathname, search } = useLocation();
  if (item.search === undefined) return undefined;
  return pathname === item.path && searchMatches(search, item.search);
}

/** A single nav row (leaf link). Renders the current user's avatar instead of an
 * icon when `item.avatar` is set — the "Assigned to me" row. The icon rides a
 * shade quieter than its label, catching up to it on hover/active.
 *
 * `collapsed` is the classic menu's icon rail: the label and badge drop away
 * from `md` up and the label becomes the tooltip. The two-level menu never
 * passes it — collapsing there hides the whole panel, so its rows are only ever
 * drawn at full width. */
export function NavLeafItem({
  item,
  collapsed,
  unseen,
  onNavigate,
}: {
  item: NavItem;
  collapsed?: boolean;
  unseen: number;
  onNavigate: () => void;
}) {
  const { user } = useAuth();
  const queryActive = useQueryActive(item);

  return (
    <NavLink
      to={item.search ? { pathname: item.path, search: item.search } : item.path}
      end={item.end}
      onClick={onNavigate}
      title={collapsed ? t(item.labelKey) : undefined}
      className={({ isActive }) =>
        cn(
          ROW,
          (queryActive ?? isActive) && 'bg-sidebar-accent text-sidebar-accent-foreground',
          collapsed && 'md:justify-center md:gap-0',
        )
      }
    >
      {({ isActive }) => {
        const active = queryActive ?? isActive;
        return (
          <>
            <span
              className={cn(
                'grid size-5 shrink-0 place-items-center transition-colors',
                active
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
        );
      }}
    </NavLink>
  );
}

/** A collapsible nav parent: the row toggles its children; a rotated chevron
 * shows state. Children hang off a left guide line, the way a space's lists
 * nest — the one place a third level is allowed. */
export function NavParentItem({
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
              unseen={0}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Reorder wiring the list hands each expanded team row. */
interface RowDrag {
  /** This row is the one being lifted — dimmed in place. */
  dragging: boolean;
  /** A team is landing just above this row — draw the insertion line. */
  isOver: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

/**
 * The teams in the sidebar, reorderable by the current user. The order is
 * *personal* — saved per browser (`TEAMS_ORDER_KEY`), like the collapse/expand
 * state — so everyone (not just admins) can arrange their own sidebar, and doing
 * so never moves anyone else's. Teams with no saved position (newly added) trail
 * behind in their natural `order`, so the list is always complete.
 *
 * Follows the app's native-DnD idiom (grip cue + drag/over/drop + an insertion
 * line) already used by the test-case table, rather than the heavier board — the
 * right weight for a vertical list.
 */
export function TeamNavList({
  teams,
  collapsed,
  pathname,
  onNavigate,
  isOpen,
  onToggle,
}: {
  teams: TeamDto[];
  /** Classic menu's icon rail — reorder is an expanded-only action. */
  collapsed?: boolean;
  pathname: string;
  onNavigate: () => void;
  /** Shared expand-state mechanics (`useNavGroups`) — a cycles-enabled team is a
   *  collapsible parent (its Current/Upcoming links), keyed by its route. */
  isOpen: (path: string) => boolean;
  onToggle: (path: string) => void;
}) {
  const [orderIds, setOrderIds] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(TEAMS_ORDER_KEY) || '[]');
      return Array.isArray(raw) ? (raw as string[]) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem(TEAMS_ORDER_KEY, JSON.stringify(orderIds));
  }, [orderIds]);

  // Sort by the saved personal order; anything unranked (a new team) falls back
  // to its natural `order`, so it lands after the arranged ones instead of jumping.
  const ordered = useMemo(() => {
    const rank = new Map(orderIds.map((id, i) => [id, i] as const));
    return [...teams].sort((a, b) => {
      const ra = rank.get(a.id) ?? Infinity;
      const rb = rank.get(b.id) ?? Infinity;
      return ra === rb ? a.order - b.order : ra - rb;
    });
  }, [teams, orderIds]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const stopDrag = () => {
    setDragId(null);
    setOverId(null);
  };

  // Move the dragged team to the dropped-on team's slot, then persist the full
  // order — the same splice the test-case table uses, so it reaches every position.
  function reorder(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = ordered.map((x) => x.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrderIds(next);
  }

  return (
    <>
      {ordered.map((team) => (
        <TeamNavItem
          key={team.id}
          team={team}
          collapsed={collapsed}
          active={pathname === `/teams/${team.id}`}
          open={isOpen(`/teams/${team.id}`)}
          onToggleOpen={() => onToggle(`/teams/${team.id}`)}
          onNavigate={onNavigate}
          drag={{
            dragging: dragId === team.id,
            isOver: overId === team.id && dragId !== null && dragId !== team.id,
            onDragStart: (e) => {
              setDragId(team.id);
              e.dataTransfer.effectAllowed = 'move';
            },
            onDragEnd: stopDrag,
            onDragOver: (e) => {
              if (!dragId || dragId === team.id) return;
              e.preventDefault();
              if (overId !== team.id) setOverId(team.id);
            },
            onDrop: (e) => {
              e.preventDefault();
              reorder(team.id);
              stopDrag();
            },
          }}
        />
      ))}
    </>
  );
}

/**
 * A team in the nav — a workspace "space". The symbol is a picker in place
 * (admin/product only) — so it's a real button and can't live inside the row's
 * <a>; the name is the link instead.
 *
 * The whole row is a drag source (`drag`) so the current user can reorder the
 * sidebar; the inner links are `draggable={false}` so grabbing a name drags the
 * row rather than the link's URL, while a plain click still navigates.
 */
function TeamNavItem({
  team,
  collapsed,
  active,
  open,
  onToggleOpen,
  onNavigate,
  drag,
}: {
  team: TeamDto;
  collapsed?: boolean;
  active: boolean;
  open: boolean;
  onToggleOpen: () => void;
  onNavigate: () => void;
  drag?: RowDrag;
}) {
  const { canManageDelivery } = useAuth();
  // Which cycle child (if any) the current URL points at — `?cycle=` belongs to
  // this team's board only when the row itself is the active route.
  const { search } = useLocation();
  const cycleQ = active ? new URLSearchParams(search).get('cycle') : null;

  // Classic menu's collapsed rail: icon-only navigation, no picker, no reorder,
  // so it stays pure navigation (and doesn't drag).
  if (collapsed) {
    return (
      <NavLink
        to={`/teams/${team.id}`}
        onClick={onNavigate}
        title={team.name}
        className={cn(
          ROW,
          active && 'bg-sidebar-accent text-sidebar-accent-foreground',
          'md:justify-center md:gap-0',
        )}
      >
        <span className="grid size-5 shrink-0 place-items-center">
          <TeamIconPicker team={team} size={18} readOnly />
        </span>
        <span className="flex-1 truncate md:hidden">{team.name}</span>
      </NavLink>
    );
  }

  return (
    <div>
      <div
        draggable
        onDragStart={drag?.onDragStart}
        onDragEnd={drag?.onDragEnd}
        onDragOver={drag?.onDragOver}
        onDrop={drag?.onDrop}
        className={cn(
          ROW,
          'group/team relative',
          // A selected cycle child carries the highlight instead of the row.
          active && !cycleQ && 'bg-sidebar-accent text-sidebar-accent-foreground',
          drag?.dragging && 'opacity-40',
          // Insertion line marking where the dragged team will land — a
          // pseudo-element, so it never nudges the row's height.
          drag?.isOver &&
            "before:absolute before:inset-x-1 before:-top-px before:h-0.5 before:rounded-full before:bg-primary before:content-['']",
        )}
      >
        <span className="grid size-5 shrink-0 place-items-center">
          <TeamIconPicker
            team={team}
            size={18}
            className="-my-0.5"
            readOnly={!canManageDelivery}
          />
        </span>
        <Link
          to={`/teams/${team.id}`}
          draggable={false}
          onClick={onNavigate}
          className="min-w-0 flex-1 truncate"
        >
          {team.name}
        </Link>
        {canManageDelivery && (
          // This team's own settings — where its board columns (statuses) are
          // owned, since a board can't add one. Revealed on hover.
          <Link
            to={`/admin/settings?tab=team:${team.id}`}
            draggable={false}
            onClick={onNavigate}
            title={t('teams.settings').replace('{team}', team.name)}
            aria-label={t('teams.settings').replace('{team}', team.name)}
            className={cn(ACTION, 'group-hover/team:opacity-100')}
          >
            <MoreHorizontal className="size-3.5" aria-hidden />
          </Link>
        )}
        {team.cyclesEnabled && (
          // Cycles make the team a parent — same chevron mechanics as NavParentItem.
          <button
            type="button"
            onClick={onToggleOpen}
            aria-expanded={open}
            aria-label={t('cycles.title')}
            className={cn(ACTION, 'opacity-100')}
          >
            <Icon
              name="chevron-right"
              size={14}
              className={cn('transition-transform duration-150', open && 'rotate-90')}
            />
          </button>
        )}
      </div>

      {team.cyclesEnabled && open && (
        // Current / Upcoming — the board pre-scoped by the `?cycle=` sentinels,
        // which the API resolves per-read, so these links never go stale as
        // cycles roll. Same guide-line look as NavParentItem children.
        <div className="ml-[18px] mt-0.5 flex flex-col gap-0.5 border-l border-sidebar-border pl-2.5">
          <Link
            to={`/teams/${team.id}?cycle=current`}
            draggable={false}
            onClick={onNavigate}
            className={cn(
              ROW,
              cycleQ === 'current' && 'bg-sidebar-accent text-sidebar-accent-foreground',
            )}
          >
            <span className="grid size-5 shrink-0 place-items-center">
              <CircleDot className="size-3.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate">{t('cycles.current')}</span>
          </Link>
          <Link
            to={`/teams/${team.id}?cycle=upcoming`}
            draggable={false}
            onClick={onNavigate}
            className={cn(
              ROW,
              cycleQ === 'upcoming' && 'bg-sidebar-accent text-sidebar-accent-foreground',
            )}
          >
            <span className="grid size-5 shrink-0 place-items-center">
              <CalendarClock className="size-3.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate">{t('cycles.upcoming')}</span>
          </Link>
        </div>
      )}
    </div>
  );
}

/** Icon for a pinned entity — reuses the same glyphs as the nav/boards. An issue
 *  shows its concrete kind (bug vs task) via `issueKind`. */
function favouriteIcon(fav: FavouriteDto): IconName {
  if (fav.kind === FavouriteKind.ROADMAP_ITEM) return 'roadmap';
  // The same glyph the Docs nav item uses, so a pinned doc reads as a doc.
  if (fav.kind === FavouriteKind.DOC) return 'book';
  return fav.issueKind === 'bug' ? 'bug' : 'tasks';
}

/** Where a pinned entity opens. A roadmap item deep-links to its board + dialog;
 *  an issue opens at `/issues/<ref>`, whichever kind it is; a doc opens by its
 *  stored uuid, which the workspace resolves and then rewrites to the canonical
 *  `/docs/DOC-…/<page-slug>`. */
function favouriteHref(fav: FavouriteDto): string {
  switch (fav.kind) {
    case FavouriteKind.ISSUE:
      return `/issues/${fav.refId}`;
    case FavouriteKind.ROADMAP_ITEM:
      return fav.roadmapId ? `/roadmaps/${fav.roadmapId}/items/${fav.refId}` : '/roadmaps';
    case FavouriteKind.DOC:
      return `/docs/${fav.refId}`;
    default:
      return '/';
  }
}

/**
 * One pinned entity in the sidebar: an icon + title with a hover "unpin" (×) —
 * the symbol is a real button, so like a team row the label is a separate <Link>.
 */
export function FavouriteNavItem({
  fav,
  collapsed,
  onNavigate,
}: {
  fav: FavouriteDto;
  /** Classic menu's icon rail: the icon alone links, and unpin is suppressed. */
  collapsed?: boolean;
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
          <Icon name={favouriteIcon(fav)} size={18} />
        </span>
      </NavLink>
    );
  }

  return (
    <div className={cn(ROW, 'group/fav')}>
      <span className="grid size-5 shrink-0 place-items-center text-muted-foreground transition-colors group-hover/fav:text-sidebar-accent-foreground">
        <Icon name={favouriteIcon(fav)} size={18} />
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
