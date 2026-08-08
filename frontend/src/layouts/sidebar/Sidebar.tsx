import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, MoreHorizontal, Plus, Star } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { findAreaId, NAV_AREAS } from '@/layouts/sidebar/menuConfig';
import { t } from '@/i18n';
import { useInbox } from '@/features/inbox/api';
import { useFavourites } from '@/features/favourites/api';
import { useTeams } from '@/features/teams/api';
import { CreateTeamDialog } from '@/features/teams/CreateTeamDialog';
import { ProfileMenu } from '@/layouts/sidebar/ProfileMenu';
import {
  ACTION,
  FavouriteNavItem,
  NAV_DIVIDER,
  NAV_FOOTER_CELL,
  NavHeading,
  NavLeafItem,
  NavParentItem,
  RailButton,
  ROW,
  SidebarCreateMenu,
  TeamNavList,
  useNavGroups,
  useNavSections,
  useSelectedArea,
  useSidebarWidth,
} from '@/layouts/sidebar/navPrimitives';

const COLLAPSE_KEY = 'ph_nav_collapsed';
/** The dragged width, per browser — see `useSidebarWidth`. */
const WIDTH_KEY = 'ph_nav_width';

/**
 * Level 1, the icon rail — wide enough for a whole area label under the glyph,
 * since a rail reading "Works…" is worse than no label at all. Renaming an area
 * is a wording call, so the width leaves headroom rather than fitting today's
 * words exactly. Fixed: the rail holds glyphs, so dragging the sidebar wider
 * gives every pixel to the panel, where the labels are.
 */
const RAIL_W = 'w-[68px]';
const RAIL_PX = 68;
/**
 * Level 2, the panel beside it — the part that grows. 68 + 220 = the sidebar's
 * default 288px; the bounds below are the panel's, so they read as what a *row*
 * gets: 180px is about where "Product Discovery" starts truncating, and past
 * 420 the rows are mostly whitespace.
 */
const PANEL_W = 'w-[220px]';
const SIDEBAR_W = { initial: 288, min: RAIL_PX + 180, max: RAIL_PX + 420 };
/**
 * The panel's share of the dragged width. Only meaningful from `md` up — below
 * it the drawer is a fixed width and `PANEL_W` stands.
 */
const PANEL_FLEX_W = 'md:w-[calc(var(--sidebar-w)-68px)]';

interface SidebarProps {
  /** Whether the mobile drawer is open. */
  mobileOpen: boolean;
  /** Close the mobile drawer (also fired on any nav click). */
  onCloseMobile: () => void;
}

/**
 * The app's sidebar, in two levels: an always-visible icon **rail** of areas —
 * two of them, `workspace` and `more` — and a **panel** showing only the
 * selected area's destinations.
 *
 * The rail used to carry five stops — Home, Discovery, Delivery, Quality, More —
 * and the first four have merged into the one workspace panel, where they read
 * as headings instead. They were phases of the same job, so switching between them
 * cost a rail click before most navigation. What's left on the rail is the one
 * genuine change of room: using the product, or administering it.
 *
 * This file owns the *shape* — rail beside panel, this order, this collapse. The
 * IA it renders comes from `menuConfig`, and every row from `navPrimitives`:
 * nothing about how a team, a favourite or a nav link looks is decided here.
 *
 * Collapsing hides the panel and keeps the rail, so the areas never disappear.
 * A rail click while collapsed floats the panel over the page (a "peek") instead
 * of pushing it — otherwise collapsing would strand every level-2 destination.
 */
export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { isAdmin, canManageDelivery } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { data: inbox } = useInbox();
  const unseen = inbox?.unseenCount ?? 0;
  const { data: favourites } = useFavourites();
  // Teams are dynamic (QC/Engineering are seeded); archived ones drop out.
  const { data: teams } = useTeams();
  const activeTeams = (teams ?? []).filter((x) => !x.archived);

  const [creatingTeam, setCreatingTeam] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(COLLAPSE_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);
  const { width, dragging, handle } = useSidebarWidth({ storageKey: WIDTH_KEY, ...SIDEBAR_W });

  const areas = NAV_AREAS.filter((a) => !a.adminOnly || isAdmin);
  const [selectedId, setSelectedId] = useSelectedArea(findAreaId(pathname, search), areas[0].id);
  // An area can go away under a remembered id — a non-admin whose browser still
  // remembers `more`. Falling back keeps the panel from rendering empty.
  const area = areas.find((a) => a.id === selectedId) ?? areas[0];

  const { isOpen, toggleGroup } = useNavGroups();
  const { sectionOpen, toggleSection } = useNavSections();

  // The peeked panel is dismissed by Escape or a click anywhere outside the
  // sidebar — it floats over the page, so it must not trap the next click.
  const [peek, setPeek] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!peek) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPeek(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!asideRef.current?.contains(e.target as Node)) setPeek(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [peek]);

  /**
   * Going somewhere from the panel closes both the mobile drawer and a peek —
   * you asked for a page, not for the nav to stay in the way. A *rail* click
   * doesn't: switching area is choosing what to look through next, so the panel
   * stays open (which is also what keeps the peek from closing itself on the
   * navigation it just triggered).
   */
  const goFromPanel = () => {
    onCloseMobile();
    setPeek(false);
  };

  const collapseToggle = (
    <button
      type="button"
      onClick={() => {
        setCollapsed((c) => !c);
        setPeek(false);
      }}
      title={collapsed ? t('nav.expand') : t('nav.collapse')}
      aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
      className="hidden size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:grid"
    >
      {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
    </button>
  );

  // Every row the panel draws, so a row can tell whether a *sibling* claims the
  // URL it's pointing at — All issues and Bugs share `/issues`, in two sections.
  const panelItems = area.sections.flatMap((s) => s.items);

  /** The selected area's sections — the whole of level 2. */
  const panel = (
    <>
      {/* Header — the area's name, linking to its landing page, beside the one
          create action. Kept at h-12 so it lines up with the topbar's own row
          across the divide. */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-sidebar-border px-3">
        <Link
          to={area.path}
          onClick={goFromPanel}
          className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
        >
          {t(area.labelKey)}
        </Link>
        <SidebarCreateMenu onNewTeam={() => setCreatingTeam(true)} onNavigate={goFromPanel} />
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
        {area.sections.map((section) => {
          // Favourites — the user's own pins. Hidden when there are none, and
          // closed off with a hairline: they're the one section the *user* filled,
          // not part of the app's structure.
          if (section.dynamic === 'favourites') {
            if (!favourites || favourites.length === 0) return null;
            return (
              <Fragment key={section.key}>
                <div className="flex flex-col gap-0.5">
                  <NavHeading
                    label={t(section.headingKey!)}
                    icon={<Star className="size-3.5" aria-hidden />}
                    open={sectionOpen(section.key)}
                    onToggle={() => toggleSection(section.key)}
                  />
                  {sectionOpen(section.key) &&
                    favourites.map((fav) => (
                      <FavouriteNavItem
                        key={`${fav.kind}:${fav.refId}`}
                        fav={fav}
                        onNavigate={goFromPanel}
                      />
                    ))}
                </div>
                {section.dividerAfter && <div className={NAV_DIVIDER} />}
              </Fragment>
            );
          }

          // Delivery — the section's own rows (All issues) followed by the teams,
          // each a space with its own board, statuses and cycles. The team list is
          // appended rather than replacing `items`, so the block is one list with
          // the unscoped view at its head; it renders even with no teams yet,
          // because All issues is always there.
          if (section.dynamic === 'teams') {
            const items = section.items.filter((i) => !i.adminOnly || isAdmin);
            return (
              <div key={section.key} className="flex flex-col gap-0.5">
                <NavHeading
                  label={t(section.headingKey!)}
                  open={sectionOpen(section.key)}
                  onToggle={() => toggleSection(section.key)}
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
                          onClick={goFromPanel}
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
                {sectionOpen(section.key) && (
                  <>
                    {items.map((item) => (
                      <NavLeafItem
                        key={`${item.path}?${item.search ?? ''}`}
                        item={item}
                        peers={panelItems}
                        unseen={unseen}
                        onNavigate={goFromPanel}
                      />
                    ))}
                    <TeamNavList
                      teams={activeTeams}
                      pathname={pathname}
                      onNavigate={goFromPanel}
                      isOpen={isOpen}
                      onToggle={toggleGroup}
                    />
                    {/* A quiet "add another" foot to the list — the same create the
                        heading's `+` runs, but where the eye lands after reading the
                        spaces. Mirrors a workspace's "+ New Space". */}
                    {canManageDelivery && (
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
            );
          }

          const items = section.items.filter((i) => !i.adminOnly || isAdmin);
          if (items.length === 0) return null;
          // A headingless section is the panel's lead group: nothing to toggle,
          // so it's always open.
          const open = !section.headingKey || sectionOpen(section.key);
          return (
            <Fragment key={section.key}>
              <div className="flex flex-col gap-0.5">
                {section.headingKey && (
                  <NavHeading
                    label={t(section.headingKey)}
                    open={sectionOpen(section.key)}
                    onToggle={() => toggleSection(section.key)}
                  />
                )}
                {open &&
                  items.map((item) =>
                    item.children ? (
                      <NavParentItem
                        key={item.path}
                        item={item}
                        // Standing on any of its views keeps the group open.
                        open={isOpen(item.path, item.children.map((c) => c.path))}
                        onToggle={() => toggleGroup(item.path, item.children!.map((c) => c.path))}
                        onNavigate={goFromPanel}
                      />
                    ) : (
                      <NavLeafItem
                        key={`${item.path}?${item.search ?? ''}`}
                        item={item}
                        peers={panelItems}
                        unseen={unseen}
                        onNavigate={goFromPanel}
                      />
                    ),
                  )}
              </div>
              {/* Ends the block of rows that are *mine*, before the app's own
                  headed sections start. Declared in `menuConfig`, so which
                  blocks get one is answered in the model, not here. */}
              {section.dividerAfter && <div className={NAV_DIVIDER} />}
            </Fragment>
          );
        })}
      </nav>

      {/* The signed-in user's menu: avatar → appearance, language, sign out.
          Collapsed it moves to the rail, so the peeked panel doesn't show a
          second copy — but the drawer below md always shows the panel, and there
          it stays here where there's room for the name. */}
      <ProfileMenu onCloseMobile={goFromPanel} className={cn(collapsed && 'md:hidden')} />
    </>
  );

  return (
    <aside
      ref={asideRef}
      // The dragged width rides as a variable so the panel can take its share of
      // it in CSS, and so the fixed widths (mobile drawer, collapsed rail) stay
      // media queries rather than something this component has to compute.
      style={{ '--sidebar-w': `${width}px` } as React.CSSProperties}
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-[288px] border-r bg-sidebar text-sidebar-foreground shadow-xl transition-[width,transform] duration-200 md:shrink-0',
        'md:sticky md:top-0 md:z-30 md:translate-x-0 md:shadow-none',
        collapsed ? 'md:w-[68px]' : 'md:w-[var(--sidebar-w)]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        // The width transition is what makes collapsing glide; during a drag it
        // would make the edge lag the cursor by 200ms.
        dragging && 'transition-none',
      )}
    >
      {/* Level 1 — the rail. Always visible, at every width. Its right edge is
          the divider between the two levels, so it goes when the panel does —
          the aside's own border is the outer boundary either way. */}
      <div
        className={cn(
          'flex shrink-0 flex-col border-r border-sidebar-border',
          RAIL_W,
          collapsed && 'md:border-r-0',
        )}
      >
        {/* The brand mark, at the top of the rail where a workspace switcher
            would sit. The product's name rides in the tooltip: at 68px the mark
            is all that fits, and the panel's title is the more useful label. */}
        <Link
          to="/"
          onClick={goFromPanel}
          title={t('app.name')}
          className="grid h-12 shrink-0 place-items-center border-b border-sidebar-border text-lg text-primary"
        >
          <span aria-hidden>◑</span>
          <span className="sr-only">{t('app.name')}</span>
        </Link>

        <nav
          aria-label={t('nav.areas')}
          // `px-1`, not `px-2`: the micro-labels get every pixel of the 68px
          // rail, so a longer area name still sits under its glyph without an
          // ellipsis. The tile inside each button is a fixed 36px and stays
          // centred either way.
          className="flex flex-1 flex-col items-center gap-1 overflow-y-auto px-1 py-2"
        >
          {areas.map((a) => (
            <RailButton
              key={a.id}
              area={a}
              active={a.id === area.id}
              onSelect={() => {
                setSelectedId(a.id);
                // Collapsed, the panel is the only way to reach level 2 — float
                // it rather than making the user expand the sidebar first.
                if (collapsed) setPeek(true);
              }}
            />
          ))}
        </nav>

        {/* The rail's footer is one `NAV_FOOTER_CELL` per control, stacked — so
            whichever cell ends up at the bottom shares its top edge with the
            panel's profile and with a feature's own footer beside it. */}
        <div className="flex shrink-0 flex-col">
          <div className={cn(NAV_FOOTER_CELL, 'justify-center')}>{collapseToggle}</div>
          {/* Collapsed there is no panel footer to hold it. `md:` only: below it
              the panel is always open and carries the profile itself. */}
          {collapsed && <ProfileMenu compact onCloseMobile={goFromPanel} className="hidden md:flex" />}
        </div>
      </div>

      {/* Level 2 — the panel, docked beside the rail. */}
      <div className={cn('flex min-w-0 flex-col', PANEL_W, PANEL_FLEX_W, collapsed && 'md:hidden')}>
        {panel}
      </div>

      {/* …and the same panel floated over the page while collapsed. Same width
          as when docked — a peek is the panel, not a different one. */}
      {collapsed && peek && (
        <div
          data-overlay-panel
          className={cn(
            'absolute left-[68px] top-0 z-10 hidden h-full flex-col rounded-r-xl border bg-sidebar shadow-2xl md:flex',
            PANEL_W,
            PANEL_FLEX_W,
          )}
        >
          {panel}
        </div>
      )}

      {/* Drag the menu wider. Not while collapsed: there the width is the rail's
          68px and there's nothing to give the extra pixels to. */}
      {!collapsed && handle}

      {/* Opening the new team's board is the confirmation — it proves the team
          exists and lands you where you'd go next anyway. */}
      <CreateTeamDialog
        open={creatingTeam}
        onClose={() => setCreatingTeam(false)}
        onCreated={(team) => {
          navigate(`/teams/${team.id}`);
          goFromPanel();
        }}
      />
    </aside>
  );
}
