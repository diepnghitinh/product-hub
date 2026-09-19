import type { ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, CalendarDays, CalendarRange, LayoutGrid, List } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button, Checkbox } from '@/components/ui';
import { AssigneeBadge } from '@/components/AssigneeBadge';
import { BoardSkeleton, CalendarSkeleton, ListSkeleton, TimelineSkeleton } from '@/components/Skeletons';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { BOARD_GUTTER, IssueBoardLayout } from '@/components/IssueBoardLayout';
import { IssueTimelineView } from '@/features/issues/IssueTimelineView';
import { IssueCalendarView } from '@/features/issues/IssueCalendarView';
import { SortMenu } from '@/features/issues/SortMenu';
import { applyIssueSort, useIssueSort } from '@/features/issues/useIssueSort';
import { SavedViewBar } from '@/features/saved-views/SavedViewBar';
import { useSavedView } from '@/features/saved-views/useSavedView';
import { teamScope } from '@/features/saved-views/scope';
import { Icon } from '@/components/Icon';
import { BackLink } from '@/components/BackLink';
import {
  BoardCard,
  BoardCardAge,
  KanbanBoard,
  KanbanCardToolbar,
  SubtaskCount,
} from '@/components/KanbanBoard';
import { LabelChips } from '@/features/labels/LabelChips';
import { FilterMenu, type FilterCategory } from '@/components/FilterMenu';
import { applyBoardView, useBoardView, useFilterParams, useSearchParam, type BoardView } from '@/components/filterParams';
import { issueSharedFilterParams, issueSharedFilters } from '@/features/issues/issueFilters';
import { useUsers } from '@/features/users/api';
import { useProjects } from '@/features/projects/api';
import {
  BUG_SEVERITIES,
  BUG_SEVERITY_COLOR,
  BUG_SEVERITY_LABEL,
  BugSeverity,
  BugStatus,
  IssueKind,
  TeamIssueType,
} from '@/types/enums';
import type { TaskLabelConfig } from '@/types/enums';
import type { BugDto, CycleDto, TeamDto } from '@/types/dto';
import { useBugs, useDeleteBug, useSetBugStatus } from './api';
import { StabilityView } from './StabilityView';
import { useTeamStatuses, useTeamLabelsLookup } from '@/features/teams/api';
import { TeamShareMenu } from '@/features/teams/TeamShareMenu';
import {
  CarryOverBadge,
  CycleBoardBanner,
  CycleChip,
  CycleFilterSelect,
  IssueCycleChip,
} from '@/features/cycles/CycleControls';
import { useCycleLookup, useCycles, useFocusedCycle, useResolvedCycleId } from '@/features/cycles/api';
import { CycleInsightsButton } from '@/features/cycles/CycleInsights';
import { useIssueSelection, type IssueSelection } from '@/features/issues/useIssueSelection';
import { BulkActionBar, buildCycleOptions } from '@/features/issues/BulkActionBar';

/** Severity → dot color (shadcn semantic tokens). */
const SEVERITY_DOT: Record<BugSeverity, string> = {
  [BugSeverity.LOW]: 'bg-muted-foreground',
  [BugSeverity.MEDIUM]: 'bg-info',
  [BugSeverity.HIGH]: 'bg-warning',
  [BugSeverity.CRITICAL]: 'bg-destructive',
};

/** Bug card — follows the shared `BoardCard` standard (see the roadmap item).
 * `labels` is the owning team's label set; the card resolves the bug's own
 * `labelKeys` against it (see `LabelChips`). */
export function BugCard({
  bug,
  labels,
  cycle,
  overlay = false,
}: {
  bug: BugDto;
  labels?: TaskLabelConfig[];
  /** The cycle this bug is committed to, resolved by the board (`useCycleLookup`)
   *  — a hook per card isn't legal and the rows can span teams. */
  cycle?: CycleDto;
  overlay?: boolean;
}) {
  return (
    <BoardCard
      overlay={overlay}
      titleDotColor={BUG_SEVERITY_COLOR[bug.severity]}
      titleDotLabel={BUG_SEVERITY_LABEL[bug.severity]}
      title={bug.title}
      labels={
        // Cycle first, like the roadmap card: "when" is what you scan a board for.
        // Wraps — a card is narrow and a half-clipped chip reads as broken.
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <IssueCycleChip cycle={cycle} />
          <LabelChips keys={bug.labelKeys} labels={labels} />
        </div>
      }
      metaLeading={
        <AssigneeBadge assignees={bug.assignees} unassignedLabel={t('bugs.unassigned')} />
      }
      metaTrailing={
        <>
          <CarryOverBadge count={bug.carryOverCount} />
          <SubtaskCount done={bug.subtaskDoneCount} total={bug.subtaskCount} />
          <BoardCardAge createdAt={bug.createdAt} />
        </>
      }
      // See the task card: a bar on a leaf would only restate the column.
      progress={bug.subtaskCount ? bug.progress : undefined}
    />
  );
}

interface BugsBoardPageProps {
  /** Scope the board to a team's issue list (the /teams/:id route). */
  teamId?: string;
  /** Team name for the header, when rendered inside a team. */
  teamName?: string;
  /** The team's symbol, rendered beside the heading. */
  titleIcon?: ReactNode;
  /** The team, when rendered inside a team board — enables the ⋯ → Share menu. */
  shareTeam?: TeamDto;
}

export function BugsBoardPage({ teamId, teamName, titleIcon, shareTeam }: BugsBoardPageProps = {}) {
  const { user, canEditDelivery: canWrite, canManageDelivery } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const projectId = params.get('projectId') || undefined;
  const projectName = params.get('project') || undefined;
  const caseId = params.get('caseId') || undefined;
  const caseName = params.get('case') || undefined;
  const reportId = params.get('reportId') || undefined;

  // Both ride in the URL (`?q=` and `?f.<category>=`), like `view`, `cycle` and
  // the sort below — so Back out of a bug lands on the list you were actually
  // looking at, and a filtered board can be reloaded or shared. The `f.` prefix
  // is what keeps the `projectId` *filter* clear of the `?projectId=` above,
  // which scopes the whole board; see `filterParams.ts`.
  const [search, setSearch] = useSearchParam();
  const [filters, setFilters] = useFilterParams();
  // Board is default and kept out of the URL; ?view=list | ?view=timeline are shareable.
  const [view, setView] = useBoardView();
  const isList = view === 'list';
  // The Stability tab is a chart over the board's whole history, not a list of
  // issues — so none of the toolbar's narrowing controls apply to it (see the
  // toolbar props below), and it renders before the list's loading/empty gates.
  const isStability = view === 'stability';
  // List-view ordering only (see `SortMenu`), and opt-in: until the user picks
  // one, neither param is sent, so board, timeline and a fresh list all keep the
  // ordering they have today. It rides in ?sort=&dir= like `view` above, so a
  // reload or a shared link keeps it. Severity is a real field here — every row
  // is a bug — so the URL is allowed to carry it.
  const [sort, setSort] = useIssueSort({ severity: true });
  // Cycle scope rides in ?cycle= (an id or current/upcoming/none — the API
  // resolves the sentinels against this team, so the sidebar's saved links stay
  // valid as cycles roll). Only meaningful on a team board.
  const cycleParam = params.get('cycle') || '';
  const setCycleParam = (v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set('cycle', v);
    else next.delete('cycle');
    setParams(next, { replace: true });
  };
  // The concrete cycle id behind the filter (sentinels resolved) — what a create
  // from this filtered board carries.
  const resolvedCycleId = useResolvedCycleId(shareTeam, cycleParam);
  // The scoped cycle as a DTO — drives the board's cycle banner; when it's set,
  // the banner carries the rhythm, so the toolbar's ambient chip stands down.
  const focusedCycle = useFocusedCycle(shareTeam, cycleParam);

  // Reporting opens the full New bug page — carrying the board's team, the column
  // when added from one, the board's cycle scope, and whatever this board is
  // scoped to (project / test case / report), so the draft opens pre-set exactly
  // there. A cycle-filtered board creates INTO that cycle — otherwise the new
  // card instantly vanishes from the filtered view.
  const newBugHref = (status?: string) => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (teamId) p.set('teamId', teamId);
    if (resolvedCycleId) p.set('cycleId', resolvedCycleId);
    if (projectId) p.set('projectId', projectId);
    if (caseId) p.set('caseId', caseId);
    if (caseName) p.set('case', caseName);
    if (reportId) p.set('reportId', reportId);
    const qs = p.toString();
    return `/bugs/new${qs ? `?${qs}` : ''}`;
  };

  const setStatus = useSetBugStatus();
  const remove = useDeleteBug();
  // Columns belong to the team that owns this board (default bug team when standalone).
  const columns = useTeamStatuses(teamId, TeamIssueType.BUG);
  // Labels resolve per-bug (a standalone board's bugs all sit in the default team,
  // but each still carries its own teamId — so resolve against that, not the board's).
  const labelsFor = useTeamLabelsLookup();

  // People + projects are only needed to label the filter options.
  const { data: usersData } = useUsers({ limit: 100 }, canManageDelivery);
  const { data: projectsData } = useProjects({ limit: 100 });

  // `?sv=<id>` names a saved view to open — same contract as the workspace
  // board: the view writes its filters, search, view and sort into the URL as
  // ordinary params, so `sv` is only ever a label on a state the URL fully
  // describes. Only this board's own half is passed in; there's no kind switch
  // here because every row is a bug.
  const savedView = useSavedView({
    // `status` isn't checked: a saved view can carry another team's status keys,
    // and this board's columns are only this team's — dropping them would be
    // right, but `columns` also arrives empty on first render, which would drop
    // a *valid* selection instead. Left alone, a stale key just matches nothing.
    valid: projectsData ? { projectId: new Set(projectsData.items.map((p) => p.id)) } : {},
    write: (next, q) => {
      applyBoardView(next, q.view);
      // Severity is always a real ordering here, so unlike the workspace board
      // there's nothing to strip on the way in.
      applyIssueSort(next, q.sort);
    },
  });

  // Bulk multi-select — List view, team boards only (see MyTasksPage for the note).
  const selection = useIssueSelection();
  const bulkEnabled = !!teamId && canWrite;
  const cyclesEnabled = !!shareTeam?.cyclesEnabled;
  const { data: cyclesData } = useCycles(cyclesEnabled ? teamId : undefined);
  const cycleOptions = cyclesEnabled ? buildCycleOptions(cyclesData) : undefined;

  const { data, isLoading } = useBugs({
    teamId,
    search: search || undefined,
    status: filters.status as BugStatus[] | undefined,
    severity: filters.severity as BugSeverity[] | undefined,
    // Assignee, creator and the three date windows — the block every board shares.
    ...issueSharedFilterParams(filters),
    // A ?projectId= in the URL scopes the whole board; the filter narrows within it.
    projectId: projectId ? [projectId] : filters.projectId,
    cycleId: teamId ? cycleParam || undefined : undefined,
    caseId,
    // Only the list view orders itself. Sending `sort` makes the API drop the
    // stored `order`, so the board (whose order *is* the drag position) and the
    // timeline must send neither param.
    sort: isList && sort ? sort.field : undefined,
    dir: isList && sort ? sort.dir : undefined,
  });

  const filterCategories: FilterCategory[] = [
    {
      id: 'status',
      label: t('bugs.status'),
      options: columns.map((c) => ({ id: c.key, label: c.label, color: c.color })),
    },
    {
      id: 'severity',
      label: t('bugs.severity'),
      options: BUG_SEVERITIES.map((s) => ({
        id: s,
        label: BUG_SEVERITY_LABEL[s],
        color: BUG_SEVERITY_COLOR[s],
      })),
    },
    // Already scoped by the URL — a project filter would be redundant.
    ...(projectId
      ? []
      : [
          {
            id: 'projectId',
            label: t('filters.project'),
            searchable: true,
            options: (projectsData?.items ?? []).map((p) => ({ id: p.id, label: p.title })),
          } satisfies FilterCategory,
        ]),
    // Assignee · creator · created date · solved date — identical on every board.
    ...issueSharedFilters({ user, users: usersData?.items }),
  ];

  const bugs = data?.items ?? [];
  // Each card names its own cycle — at the default all-cycles scope that's the
  // only place it's stated. Resolved per-row like the labels, and scoped to the
  // teams actually on this board (the standalone /bugs route spans teams).
  const cycleFor = useCycleLookup(bugs.map((b) => b.teamId));

  /** Bugs don't persist ordering, so the drop slot (`overId`) is ignored — only
   * the destination column matters. */
  function onMove(id: string, toStatus: string) {
    const bug = bugs.find((b) => b.id === id);
    if (bug && bug.status !== toStatus) setStatus.mutate({ id, status: toStatus as BugStatus });
  }

  return (
    <IssueBoardLayout
      // Neither /bugs nor /teams/:id is in the nav model, so this board's crumb
      // is the breadcrumb root and carries level 0's icon: the team's symbol on
      // a team board, else the bug mark.
      titleIcon={titleIcon ?? <Icon name="bug" size={16} className="shrink-0 text-muted-foreground" />}
      backLink={
        projectId ? (
          <BackLink to={`/testing/${projectId}`}>{projectName || t('nav.projects')}</BackLink>
        ) : undefined
      }
      title={
        teamName ??
        (caseName
          ? `${t('bugs.forCase')} ${caseName}`
          : projectName
            ? `${t('bugs.title')} — ${projectName}`
            : t('bugs.title'))
      }
      subtitle={teamName ? t('teams.issuesSubtitle') : undefined}
      // Search and Filter narrow a *list*. The Stability tab is an aggregate over
      // every serious bug the board has ever had, so both stand down there rather
      // than sitting inert above a chart they don't touch — which is also what
      // leaves that tab with no toolbar row at all (see `IssueBoardLayout`).
      search={
        isStability ? undefined : { value: search, onChange: setSearch, placeholder: t('bugs.search') }
      }
      filters={
        isStability ? undefined : (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <FilterMenu size="default" categories={filterCategories} value={filters} onChange={setFilters} />
          </div>
        )
      }
      // Every row here is a bug, so severity is always a real ordering — and on a
      // list grouped by status column it orders *within* each column, which is how
      // the criticals sitting in "Open" surface.
      sort={isList ? <SortMenu value={sort} onChange={setSort} severity /> : undefined}
      filtersEnd={
        isStability ? undefined : (
        <>
          {/* Only a team board can save a view: the scope key is the team's, and
              it's what sends the view back to *this* board when reopened. The
              standalone and project-scoped boards have no such place to return
              to, so they get no bar rather than a view that lands elsewhere. */}
          {teamId && (
            <SavedViewBar
              kind={IssueKind.BUG}
              view={view}
              filters={filters}
              sort={sort}
              search={search}
              scope={teamScope(teamId)}
              views={savedView.views}
              activeView={savedView.activeView}
              onSaved={savedView.onSaved}
            />
          )}
          {/* Insights lives in the cycle bar; that bar only exists when the board
              is scoped to one cycle, so it falls back to the toolbar here — one
              button on screen, never two. */}
          {!focusedCycle && (
            <>
              <CycleChip team={shareTeam} />
              <CycleInsightsButton team={shareTeam} cycleParam={cycleParam} />
            </>
          )}
          <CycleFilterSelect team={shareTeam} value={cycleParam} onChange={setCycleParam} />
        </>
        )
      }
      banner={
        isStability ? undefined : (
          <CycleBoardBanner team={shareTeam} value={cycleParam} onChange={setCycleParam} />
        )
      }
      view={{
        value: view,
        onChange: (v) => setView(v as BoardView),
        options: [
          { value: 'board', label: t('tasks.viewBoard'), icon: <LayoutGrid /> },
          { value: 'list', label: t('tasks.viewList'), icon: <List /> },
          { value: 'timeline', label: t('boards.viewTimeline'), icon: <CalendarRange /> },
          { value: 'calendar', label: t('boards.viewCalendar'), icon: <CalendarDays /> },
          { value: 'stability', label: t('bugs.viewStability'), icon: <Activity /> },
        ],
      }}
      actions={
        (canWrite && !teamId) || (shareTeam && canManageDelivery) ? (
          <div className="flex items-center gap-2">
            {canWrite && !teamId && (
              <Button onClick={() => navigate(newBugHref())}>+ {t('bugs.new')}</Button>
            )}
            {shareTeam && canManageDelivery && <TeamShareMenu team={shareTeam} />}
          </div>
        ) : undefined
      }
    >
      {/* Ahead of the list's loading/empty gates on purpose: the chart reads the
          board's whole history, so it has something to say even when the current
          list is empty — and it fetches its own aggregate, not these rows. */}
      {isStability ? (
        <div className={cn('min-h-0 flex-1 overflow-y-auto pb-6 pt-4', BOARD_GUTTER)}>
          <StabilityView teamId={teamId} projectId={projectId} />
        </div>
      ) : isLoading ? (
        view === 'list' ? (
          <ListSkeleton inset />
        ) : view === 'timeline' ? (
          <TimelineSkeleton />
        ) : view === 'calendar' ? (
          <CalendarSkeleton />
        ) : (
          <BoardSkeleton columns={columns.length || 4} />
        )
      ) : bugs.length === 0 ? (
        <div className="mx-4 rounded-xl border border-dashed p-8 text-center md:mx-8">
          <p className="text-muted-foreground">{t('bugs.empty')}</p>
          {canWrite && (
            <Button size="sm" className="mt-3" onClick={() => navigate(newBugHref())}>
              {teamId ? t('issues.add') : t('bugs.new')}
            </Button>
          )}
        </div>
      ) : view === 'board' ? (
        <KanbanBoard
          columns={columns}
          items={bugs}
          getId={(b) => b.id}
          getColumnKey={(b) => b.status}
          renderCard={(bug, overlay) => (
            <BugCard
              bug={bug}
              labels={labelsFor(bug.teamId)}
              cycle={cycleFor(bug.cycleId)}
              overlay={overlay}
            />
          )}
          onMove={onMove}
          disabled={!canWrite}
          onCardClick={(bug) => navigate(`/issues/${bug.shortId || bug.id}`)}
          // The add + card-toolbar affordances, same as every board.
          renderCardToolbar={
            canWrite
              ? (bug) => (
                  <KanbanCardToolbar
                    editLabel={t('common.edit')}
                    removeLabel={t('common.delete')}
                    onEdit={() => navigate(`/issues/${bug.shortId || bug.id}`)}
                    onRemove={() => {
                      if (confirm(t('bugs.confirmDelete'))) remove.mutate(bug.id);
                    }}
                  />
                )
              : undefined
          }
          onColumnAdd={canWrite ? (col) => navigate(newBugHref(col.key)) : undefined}
          addLabel={teamId ? t('issues.add') : t('bugs.addToColumn')}
        />
      ) : view === 'list' ? (
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto',
            BOARD_GUTTER,
            // Leave room for the floating bar so it never hides the last rows.
            bulkEnabled && selection.count > 0 ? 'pb-24' : 'pb-6',
          )}
        >
          <BugList
            bugs={bugs}
            columns={columns}
            labelsFor={labelsFor}
            cycleFor={cycleFor}
            // No `onOpen`: rows are `<Link>`s, so a row opens in a new tab on
            // ⌘/middle-click instead of being swallowed by a click handler.
            selection={bulkEnabled ? selection : undefined}
          />
        </div>
      ) : view === 'calendar' ? (
        <div className={cn('min-h-0 flex-1 overflow-y-auto pb-6 pt-1', BOARD_GUTTER)}>
          <IssueCalendarView items={bugs} issueType={TeamIssueType.BUG} />
        </div>
      ) : (
        <div className={cn('min-h-0 flex-1 overflow-y-auto pb-6 pt-1', BOARD_GUTTER)}>
          <IssueTimelineView items={bugs} issueType={TeamIssueType.BUG} />
        </div>
      )}

      {bulkEnabled && view === 'list' && (
        <BulkActionBar
          selection={selection}
          visibleIds={bugs.map((b) => b.id)}
          columns={columns}
          cycles={cycleOptions}
        />
      )}

    </IssueBoardLayout>
  );
}

/** List view — grouped by status column, mirroring the tasks list so both
 * teams' list views read identically. */
export function BugList({
  bugs,
  columns,
  labelsFor,
  cycleFor,
  onOpen,
  selection,
}: {
  bugs: BugDto[];
  columns: { key: string; label: string; color: string }[];
  labelsFor: (teamId: string | undefined) => TaskLabelConfig[];
  /** Row → its cycle (`useCycleLookup`). Optional so the public board, which has
   *  no `/teams` access, simply renders rows without a cycle chip. */
  cycleFor?: (cycleId: string | undefined) => CycleDto | undefined;
  /** Overrides the row's default `<Link>` with a callback — the public board
   *  opens a dialog, because `/issues/:ref` is behind auth there. Leave it off
   *  and rows are real links (see `BugRow`). */
  onOpen?: (bug: BugDto) => void;
  /** When present, each row gets a checkbox and each column a select-all. */
  selection?: IssueSelection;
}) {
  return (
    <div className="flex flex-col gap-6">
      {columns.map((col) => {
        const list = bugs.filter((b) => b.status === col.key);
        if (list.length === 0) return null;
        const ids = list.map((b) => b.id);
        const selected = selection ? ids.filter((id) => selection.isSelected(id)).length : 0;
        const headState = selected === 0 ? false : selected === list.length ? true : 'indeterminate';
        return (
          <section key={col.key}>
            <div className="mb-2 flex items-center gap-2">
              {selection && (
                <Checkbox
                  checked={headState}
                  onCheckedChange={(v) => selection.setMany(ids, v === true)}
                  aria-label={t('bulk.selectColumn')}
                />
              )}
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: col.color }}
                aria-hidden
              />
              <h2 className="text-sm font-medium text-foreground">{col.label}</h2>
              <span className="text-xs tabular-nums text-muted-foreground">{list.length}</span>
            </div>
            <div className="rounded-xl border bg-card p-2 text-card-foreground shadow-sm">
              {list.map((bug) => (
                <BugRow
                  key={bug.id}
                  bug={bug}
                  labels={labelsFor(bug.teamId)}
                  cycle={cycleFor?.(bug.cycleId)}
                  onOpen={onOpen}
                  selection={selection}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** One bug row. A real `<Link>` unless the caller overrides it — so the row can be
 * middle-clicked, ⌘/Ctrl-clicked into a new tab, or copied as a URL, which a
 * `<button onClick={navigate}>` silently swallows. Mirrors `TaskRow` exactly, and
 * for the same reason: the two lists must stay siblings. */
function BugRow({
  bug,
  labels,
  cycle,
  onOpen,
  selection,
}: {
  bug: BugDto;
  labels: TaskLabelConfig[];
  cycle?: CycleDto;
  onOpen?: (bug: BugDto) => void;
  selection?: IssueSelection;
}) {
  const content = (
    <>
      <span
        className={cn('size-2 shrink-0 rounded-full', SEVERITY_DOT[bug.severity])}
        title={BUG_SEVERITY_LABEL[bug.severity]}
      />
      <span className="min-w-0 flex-1 truncate text-sm">{bug.title}</span>
      {/* Hidden on mobile, like the labels beside it — a row has room for the
          title and the assignee first. */}
      <IssueCycleChip cycle={cycle} className="hidden shrink-0 sm:flex" />
      <LabelChips keys={bug.labelKeys} labels={labels} max={3} className="hidden shrink-0 sm:flex" />
      <SubtaskCount
        done={bug.subtaskDoneCount}
        total={bug.subtaskCount}
        className="hidden shrink-0 text-[11px] tabular-nums text-muted-foreground sm:flex"
      />
      {bug.shortId && (
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{bug.shortId}</span>
      )}
      <AssigneeBadge
        assignees={bug.assignees}
        unassignedLabel={t('bugs.unassigned')}
        className="max-w-[35%] shrink-0"
      />
    </>
  );
  // The click target keeps its own rounding/hover; the separator + selected tint
  // live on the wrapper so the checkbox sits outside the highlight and can't
  // trigger navigation.
  const className = cn(
    'flex min-w-0 flex-1 items-center gap-3 rounded-md px-4 py-3 text-left text-foreground transition-colors hover:bg-accent',
    selection?.isSelected(bug.id) && 'bg-accent',
  );
  const clickable = onOpen ? (
    <button type="button" onClick={() => onOpen(bug)} className={className}>
      {content}
    </button>
  ) : (
    <Link to={`/issues/${bug.shortId || bug.id}`} className={className}>
      {content}
    </Link>
  );

  return (
    <div className="flex items-center gap-1 [&:not(:last-child)]:border-b">
      {selection && (
        <span className="pl-2">
          <Checkbox
            checked={selection.isSelected(bug.id)}
            onCheckedChange={(v) => selection.set(bug.id, v === true)}
            aria-label={t('bulk.selectRow')}
          />
        </span>
      )}
      {clickable}
    </div>
  );
}
