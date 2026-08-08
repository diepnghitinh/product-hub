import { type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarRange, LayoutGrid, List } from 'lucide-react';
import { Badge, Button, Checkbox, Switch } from '@/components/ui';
import { AssigneeBadge } from '@/components/AssigneeBadge';
import { BoardSkeleton, ListSkeleton, TimelineSkeleton } from '@/components/Skeletons';
import { BOARD_GUTTER, IssueBoardLayout } from '@/components/IssueBoardLayout';
import { BoardCard, BoardCardAge, KanbanBoard, KanbanCardToolbar } from '@/components/KanbanBoard';
import { CiStatusChip } from '@/components/CiStatus';
import { IssueTimelineView } from '@/features/issues/IssueTimelineView';
import { LabelChips } from '@/features/labels/LabelChips';
import { FilterMenu, UNASSIGNED, type FilterCategory } from '@/components/FilterMenu';
import { SavedFilterChips, useSavedFilters } from '@/components/SavedFilters';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useUsers } from '@/features/users/api';
import { useProjects } from '@/features/projects/api';
import { useRoadmaps } from '@/features/roadmaps/api';
import { useTeamStatuses, useTeamLabelsLookup } from '@/features/teams/api';
import { TeamShareMenu } from '@/features/teams/TeamShareMenu';
import {
  CarryOverBadge,
  CycleBoardBanner,
  CycleChip,
  CycleFilterSelect,
} from '@/features/cycles/CycleControls';
import { useCycles, useFocusedCycle, useResolvedCycleId } from '@/features/cycles/api';
import { CycleInsightsButton } from '@/features/cycles/CycleInsights';
import { useIssueSelection, type IssueSelection } from '@/features/issues/useIssueSelection';
import { BulkActionBar, buildCycleOptions } from '@/features/issues/BulkActionBar';
import { TaskStatus, TeamIssueType, type TaskLabelConfig, type TeamStatusConfig } from '@/types/enums';
import type { TaskDto, TeamDto } from '@/types/dto';
import { useDeleteTask, useSetTaskStatus, useTasks } from './api';

/** The engineer's personal queue — every task assigned to them, as a kanban
 * (drag to change status) or a status-grouped list. Tasks can be created
 * straight from here (auto-assigned to the current user). */
interface MyTasksPageProps {
  /** Scope the board to a team's issue list (the /teams/:id route). */
  teamId?: string;
  /** Team name for the header, when rendered inside a team. */
  teamName?: string;
  /** The team's symbol, rendered beside the heading. */
  titleIcon?: ReactNode;
  /** The team, when rendered inside a team board — enables the ⋯ → Share menu. */
  shareTeam?: TeamDto;
}

export function MyTasksPage({ teamId, teamName, titleIcon, shareTeam }: MyTasksPageProps = {}) {
  const { user, canEditDelivery: canWrite, canManageDelivery } = useAuth();
  const navigate = useNavigate();
  // Columns belong to the team that owns this board (default task team when
  // standalone) — and so does their order, edited only in Settings → Teams.
  const columns = useTeamStatuses(teamId, TeamIssueType.TASK);
  // Labels resolve per-task — the "assigned to me" board spans teams, so each card
  // resolves against its own item's teamId (see BugsBoardPage for the same note).
  const labelsFor = useTeamLabelsLookup();

  // Creating opens the full New task page — carrying the board's team, the
  // column when added from one, and the board's cycle scope, so the draft opens
  // pre-set exactly there (a cycle-filtered board creates INTO that cycle —
  // otherwise the new card instantly vanishes from the filtered view).
  const newTaskHref = (status?: string) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (teamId) params.set('teamId', teamId);
    if (resolvedCycleId) params.set('cycleId', resolvedCycleId);
    const qs = params.toString();
    return `/tasks/new${qs ? `?${qs}` : ''}`;
  };

  // Board is the default and kept out of the query for clean URLs; ?view=list |
  // ?view=timeline survive reloads and are shareable (same pattern as the roadmap board).
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const view: 'board' | 'list' | 'timeline' =
    viewParam === 'list' ? 'list' : viewParam === 'timeline' ? 'timeline' : 'board';
  const setView = (v: 'board' | 'list' | 'timeline') => {
    const next = new URLSearchParams(searchParams);
    if (v === 'board') next.delete('view');
    else next.set('view', v);
    setSearchParams(next, { replace: true });
  };

  // Sub-tasks (a task with a parentId) share the board with top-level tasks.
  // This toggle hides them so the board reads as just the parent work items.
  // Like `view` it rides in the URL — default on (shown), so clean URLs mean the
  // current behaviour, and the choice survives reload and is shareable.
  const showSubtasks = searchParams.get('subtasks') !== 'hide';
  const setShowSubtasks = (show: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (show) next.delete('subtasks');
    else next.set('subtasks', 'hide');
    setSearchParams(next, { replace: true });
  };

  // Cycle scope rides in ?cycle= (an id or current/upcoming/none — the API
  // resolves the sentinels against this team, so the sidebar's saved links stay
  // valid as cycles roll). Only meaningful on a team board.
  const cycleParam = searchParams.get('cycle') || '';
  const setCycleParam = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set('cycle', v);
    else next.delete('cycle');
    setSearchParams(next, { replace: true });
  };
  // The concrete cycle id behind the filter (sentinels resolved) — what a create
  // from this filtered board carries.
  const resolvedCycleId = useResolvedCycleId(shareTeam, cycleParam);
  // The scoped cycle as a DTO — drives the board's cycle banner; when it's set,
  // the banner carries the rhythm, so the toolbar's ambient chip stands down.
  const focusedCycle = useFocusedCycle(shareTeam, cycleParam);

  // Filters + search are remembered per board (and saveable as named chips) —
  // each team's board keeps its own set, as does the personal "Assigned to me".
  const filterState = useSavedFilters(`tasks:${teamId ?? 'mine'}`);
  const { filters, setFilters, search, setSearch } = filterState;

  // Strictly assigned to me — the view is titled "Assigned to me". Tasks I create
  // from here still appear because New task defaults the assignee to me. Sentinel
  // keeps the list empty (not "everyone's") until the user is loaded.
  const { data, isLoading } = useTasks({
    teamId,
    search: search || undefined,
    // Inside a team the list is the team's issues; standalone it's *my* queue.
    mine: teamId ? undefined : user?.id ?? '__none__',
    status: filters.status as TaskStatus[] | undefined,
    assigneeId: filters.assigneeId,
    roadmapId: filters.roadmapId,
    roadmapItemId: filters.roadmapItemId,
    projectId: filters.projectId,
    cycleId: teamId ? cycleParam || undefined : undefined,
  });
  const tasks = data?.items ?? [];
  // Offer the toggle only when there's something to hide; filter client-side (the
  // list is already fully fetched, capped at 100) so the fetched set — and thus
  // `hasSubtasks` — stays stable whether they're shown or hidden.
  const hasSubtasks = tasks.some((tk) => tk.parentId);
  const visibleTasks = showSubtasks ? tasks : tasks.filter((tk) => !tk.parentId);
  const setStatus = useSetTaskStatus();
  const remove = useDeleteTask();

  // Only needed to label the filter options.
  const { data: usersData } = useUsers({ limit: 100 }, canManageDelivery);
  const { data: projectsData } = useProjects({ limit: 100 });
  const { data: roadmaps } = useRoadmaps();

  // Bulk multi-select lives in the List view and only on a team board — a personal
  // queue has no shared columns/cycle to move issues between. The selection stays
  // inert (no checkboxes rendered) until `bulkEnabled`, so other boards are unchanged.
  const selection = useIssueSelection();
  const bulkEnabled = !!teamId && canWrite;
  const cyclesEnabled = !!shareTeam?.cyclesEnabled;
  const { data: cyclesData } = useCycles(cyclesEnabled ? teamId : undefined);
  const cycleOptions = cyclesEnabled ? buildCycleOptions(cyclesData) : undefined;

  const filterCategories: FilterCategory[] = [
    {
      id: 'status',
      label: t('roadmaps.status'),
      options: columns.map((c) => ({ id: c.key, label: c.label, color: c.color })),
    },
    {
      id: 'assigneeId',
      label: t('filters.assignee'),
      searchable: true,
      options: [
        { id: UNASSIGNED, label: t('filters.unassigned') },
        ...(usersData?.items ?? []).map((u) => ({ id: u.id, label: u.name })),
      ],
    },
    // The whole roadmap, one level above the item below it — "what is this team
    // doing for Q3?" without having to tick every backlog item in it. Both read
    // the link the issue itself carries (`roadmapId` / `roadmapItemId`), so the
    // two AND together naturally: roadmap narrows, item narrows further.
    {
      id: 'roadmapId',
      label: t('filters.roadmap'),
      searchable: true,
      options: (roadmaps ?? []).map((r) => ({ id: r.id, label: r.title })),
    },
    {
      id: 'roadmapItemId',
      label: t('filters.backlogItem'),
      searchable: true,
      // Flattened across roadmaps and prefixed, so same-named items stay distinct.
      options: (roadmaps ?? []).flatMap((r) =>
        (r.items ?? []).map((i) => ({ id: i.id, label: `${r.title} · ${i.title}` })),
      ),
    },
    {
      id: 'projectId',
      label: t('filters.project'),
      searchable: true,
      options: (projectsData?.items ?? []).map((p) => ({ id: p.id, label: p.title })),
    },
  ];

  /** Tasks don't persist ordering, so the drop slot is ignored — only the
   * destination column matters. */
  // `overId` is the card it was dropped onto — passed straight through so the
  // card keeps the slot it was dropped in, not just the column. A drop in the
  // same column is a real move now (it reorders), so there's no status guard.
  function onMove(id: string, toStatus: string, overId: string | null) {
    const task = visibleTasks.find((tk) => tk.id === id);
    if (task) setStatus.mutate({ id, status: toStatus as TaskStatus, beforeId: overId });
  }

  return (
    <IssueBoardLayout
      // Only reaches the crumb on a team board, where /teams/:id has no nav
      // section and this board is therefore the root crumb. Standalone
      // "Assigned to me" sits under /issues, so the shell's section icon is
      // level 0 and this is dropped.
      titleIcon={titleIcon}
      title={teamName ?? t('tasks.assignedToMe')}
      subtitle={teamName ? t('teams.issuesSubtitle') : t('tasks.mySubtitle')}
      search={{ value: search, onChange: setSearch, placeholder: t('tasks.search') }}
      filters={
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <FilterMenu
            size="default"
            categories={filterCategories}
            value={filters}
            onChange={setFilters}
          />
          <SavedFilterChips state={filterState} categories={filterCategories} />
          {hasSubtasks && (
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground">
              <Switch
                checked={showSubtasks}
                onCheckedChange={setShowSubtasks}
                aria-label={t('tasks.showSubtasks')}
              />
              <span className="whitespace-nowrap">{t('tasks.showSubtasks')}</span>
            </label>
          )}
        </div>
      }
      filtersEnd={
        <>
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
      }
      banner={<CycleBoardBanner team={shareTeam} value={cycleParam} onChange={setCycleParam} />}
      view={{
        value: view,
        onChange: (v) => setView(v as 'board' | 'list' | 'timeline'),
        options: [
          { value: 'board', label: t('tasks.viewBoard'), icon: <LayoutGrid /> },
          { value: 'list', label: t('tasks.viewList'), icon: <List /> },
          { value: 'timeline', label: t('boards.viewTimeline'), icon: <CalendarRange /> },
        ],
      }}
      actions={
        (canWrite && !teamId) || (shareTeam && canManageDelivery) ? (
          <div className="flex items-center gap-2">
            {canWrite && !teamId && (
              <Button onClick={() => navigate(newTaskHref())}>+ {t('tasks.new')}</Button>
            )}
            {shareTeam && canManageDelivery && <TeamShareMenu team={shareTeam} />}
          </div>
        ) : undefined
      }
    >
      {isLoading ? (
        view === 'list' ? (
          <ListSkeleton inset />
        ) : view === 'timeline' ? (
          <TimelineSkeleton />
        ) : (
          <BoardSkeleton columns={columns.length || 4} />
        )
      ) : visibleTasks.length === 0 ? (
        <div className="mx-4 rounded-xl border border-dashed p-8 text-center md:mx-8">
          <p className="text-muted-foreground">{t('tasks.none')}</p>
          {canWrite && (
            <Button size="sm" className="mt-3" onClick={() => navigate(newTaskHref())}>
              {teamId ? t('issues.add') : t('tasks.new')}
            </Button>
          )}
        </div>
      ) : view === 'board' ? (
        <KanbanBoard
          columns={columns}
          items={visibleTasks}
          getId={(tk) => tk.id}
          getColumnKey={(tk) => tk.status}
          renderCard={(task, overlay) => (
            <TaskCard task={task} labels={labelsFor(task.teamId)} overlay={overlay} />
          )}
          onMove={onMove}
          disabled={!canWrite}
          onCardClick={(task) => navigate(`/issues/${task.shortId || task.id}`)}
          // The add + card-toolbar affordances, same as every board.
          renderCardToolbar={
            canWrite
              ? (task) => (
                  <KanbanCardToolbar
                    editLabel={t('common.edit')}
                    removeLabel={t('common.delete')}
                    onEdit={() => navigate(`/issues/${task.shortId || task.id}`)}
                    onRemove={() => {
                      if (confirm(t('tasks.confirmDelete'))) remove.mutate(task.id);
                    }}
                  />
                )
              : undefined
          }
          onColumnAdd={canWrite ? (col) => navigate(newTaskHref(col.key)) : undefined}
          addLabel={teamId ? t('issues.add') : t('tasks.addToColumn')}
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
          <TaskList
            tasks={visibleTasks}
            columns={columns}
            labelsFor={labelsFor}
            selection={bulkEnabled ? selection : undefined}
          />
        </div>
      ) : (
        <div className={cn('min-h-0 flex-1 overflow-y-auto pb-6 pt-1', BOARD_GUTTER)}>
          <IssueTimelineView items={visibleTasks} issueType={TeamIssueType.TASK} />
        </div>
      )}

      {bulkEnabled && view === 'list' && (
        <BulkActionBar
          selection={selection}
          visibleIds={visibleTasks.map((tk) => tk.id)}
          columns={columns}
          cycles={cycleOptions}
        />
      )}
    </IssueBoardLayout>
  );
}

/** Task card — follows the shared `BoardCard` standard (see the roadmap item).
 * `labels` is the owning team's label set; the card resolves the task's own
 * `labelKeys` against it (see `LabelChips`). */
export function TaskCard({
  task,
  labels,
  overlay = false,
}: {
  task: TaskDto;
  labels?: TaskLabelConfig[];
  overlay?: boolean;
}) {
  const done = task.status === TaskStatus.DONE;
  return (
    <BoardCard
      overlay={overlay}
      title={task.title}
      titleClassName={done ? 'text-muted-foreground line-through' : undefined}
      labels={<LabelChips keys={task.labelKeys} labels={labels} />}
      metaLeading={
        <AssigneeBadge assignees={task.assignees} unassignedLabel={t('tasks.unassigned')} />
      }
      metaTrailing={
        <>
          {/* First in the cluster: of the three, the build is the one that can
              change what you do next. Renders nothing until a run reports. */}
          <CiStatusChip issue={task} />
          <CarryOverBadge count={task.carryOverCount} />
          <BoardCardAge createdAt={task.createdAt} />
        </>
      }
    />
  );
}

/** The original queue view: grouped by status column, each row linking to its
 * backlog item's roadmap. `onOpen` overrides the row's default `<Link>` with a
 * callback (e.g. a public board opening a dialog instead of navigating to the
 * protected `/issues/:ref` route). */
export function TaskList({
  tasks,
  columns,
  labelsFor,
  onOpen,
  selection,
}: {
  tasks: TaskDto[];
  columns: TeamStatusConfig[];
  labelsFor: (teamId: string | undefined) => TaskLabelConfig[];
  onOpen?: (task: TaskDto) => void;
  /** When present, each row gets a checkbox and each column a select-all. */
  selection?: IssueSelection;
}) {
  return (
    <div className="flex flex-col gap-6">
      {columns.map((col) => {
        const list = tasks.filter((tk) => tk.status === col.key);
        if (list.length === 0) return null;
        const ids = list.map((tk) => tk.id);
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
              {list.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  labels={labelsFor(task.teamId)}
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

/** Trailing metadata mirrors the bug list rows (id, then assignee) so both
 * teams' lists read as siblings. */
function TaskRow({
  task,
  labels,
  onOpen,
  selection,
}: {
  task: TaskDto;
  labels: TaskLabelConfig[];
  onOpen?: (task: TaskDto) => void;
  selection?: IssueSelection;
}) {
  const content = (
    <>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          task.status === TaskStatus.DONE && 'text-muted-foreground line-through',
        )}
      >
        {task.title}
      </span>
      <LabelChips keys={task.labelKeys} labels={labels} max={3} className="hidden shrink-0 sm:flex" />
      {task.roadmapItemLabel && (
        <Badge variant="muted" className="max-w-[30%] shrink-0 truncate" title={task.roadmapItemLabel}>
          {task.roadmapItemLabel}
        </Badge>
      )}
      {task.shortId && (
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{task.shortId}</span>
      )}
      <AssigneeBadge
        assignees={task.assignees}
        unassignedLabel={t('tasks.unassigned')}
        className="max-w-[35%] shrink-0"
      />
    </>
  );
  // The click target keeps its own rounding/hover; the separator + selected tint
  // live on the wrapper so the checkbox sits outside the highlight and can't
  // trigger navigation.
  const className = cn(
    'flex min-w-0 flex-1 items-center gap-3 rounded-md px-4 py-3 text-left text-foreground transition-colors hover:bg-accent',
    selection?.isSelected(task.id) && 'bg-accent',
  );
  const clickable = onOpen ? (
    <button type="button" onClick={() => onOpen(task)} className={className}>
      {content}
    </button>
  ) : (
    <Link to={`/issues/${task.shortId || task.id}`} className={className}>
      {content}
    </Link>
  );

  return (
    <div className="flex items-center gap-1 [&:not(:last-child)]:border-b">
      {selection && (
        <span className="pl-2">
          <Checkbox
            checked={selection.isSelected(task.id)}
            onCheckedChange={(v) => selection.set(task.id, v === true)}
            aria-label={t('bulk.selectRow')}
          />
        </span>
      )}
      {clickable}
    </div>
  );
}
