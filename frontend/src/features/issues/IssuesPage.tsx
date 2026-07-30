import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarRange, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui';
import { AssigneeBadge } from '@/components/AssigneeBadge';
import { BoardSkeleton, ListSkeleton, TimelineSkeleton } from '@/components/Skeletons';
import { BOARD_GUTTER, IssueBoardLayout } from '@/components/IssueBoardLayout';
import { KanbanBoard, KanbanCardToolbar } from '@/components/KanbanBoard';
import { Icon } from '@/components/Icon';
import { IssueTimelineView } from '@/features/issues/IssueTimelineView';
import { LabelChips } from '@/features/labels/LabelChips';
import {
  FilterMenu,
  UNASSIGNED,
  type FilterCategory,
  type FilterSelections,
} from '@/components/FilterMenu';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useProjects } from '@/features/projects/api';
import { useRoadmaps } from '@/features/roadmaps/api';
import { useUsers } from '@/features/users/api';
import { useTeamStatuses, useTeamStatusesLookup, useTeamLabelsLookup } from '@/features/teams/api';
import {
  BUG_SEVERITIES,
  BUG_SEVERITY_COLOR,
  BUG_SEVERITY_LABEL,
  IssueKind,
  TeamIssueType,
  type BugSeverity,
  type TaskLabelConfig,
  type TeamStatusConfig,
} from '@/types/enums';
import type { BugDto, IssueDto, TaskDto } from '@/types/dto';
import { TaskCard } from '@/features/tasks/MyTasksPage';
import { BugCard } from '@/features/bugs/BugsBoardPage';
import { useDeleteIssue, useIssues, useSetIssueStatus } from './api';

/** The two kinds the board can show, in switch order. */
const KIND_TABS = [
  { kind: IssueKind.TASK, icon: 'tasks', labelKey: 'issues.kindTasks' },
  { kind: IssueKind.BUG, icon: 'bug', labelKey: 'issues.kindBugs' },
] as const;

/** A segmented Task | Bug control — the one axis a card can't share (task and bug
 * statuses genuinely differ), so it lives in the toolbar and switches the whole
 * board's columns + cards. Active tab uses the brand fill; there's no toggle-group
 * primitive in the UI kit, so it's two buttons. */
function KindSwitch({ value, onChange }: { value: IssueKind; onChange: (k: IssueKind) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
      {KIND_TABS.map(({ kind, icon, labelKey }) => {
        const active = value === kind;
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(kind)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon name={icon} size={15} />
            <span>{t(labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Columns for a board that spans teams. The default team's set is the baseline;
 * any status a fetched issue actually carries that's missing from it is appended,
 * labelled and coloured from that issue's *own* team (a team can rename its
 * columns or add its own). Without this, `KanbanBoard` groups by column and would
 * silently drop those rows — a board called "All issues" would be lying. The
 * fallback is a neutral token, never an invented colour.
 */
function extendColumns(
  base: TeamStatusConfig[],
  items: IssueDto[],
  statusesOf: (teamId: string | undefined) => TeamStatusConfig[],
): TeamStatusConfig[] {
  const out = [...base];
  for (const it of items) {
    if (!it.status || out.some((c) => c.key === it.status)) continue;
    out.push(
      statusesOf(it.teamId).find((c) => c.key === it.status) ?? {
        key: it.status,
        label: it.status,
        color: 'hsl(var(--muted-foreground))',
      },
    );
  }
  return out;
}

/** Which slice of the workspace the board shows. Same board, one filter apart. */
export type IssueScope = 'all' | 'mine';

/**
 * The unified issue board — tasks and bugs in one place (assigned bugs used to be
 * invisible in the task-only "Assigned to me"). A Kind switch flips between the
 * two: one kind at a time, so each keeps its own status columns and card. Board /
 * list / timeline like every other board.
 *
 * Two routes, one component:
 * - `/issues` (`scope="all"`) — every issue in the workspace, filterable by assignee.
 * - `/issues/me` (`scope="mine"`) — only what's assigned to me.
 */
export function IssuesPage({ scope }: { scope: IssueScope }) {
  const { user, canEditDelivery: canWrite, canManageDelivery } = useAuth();
  const isAll = scope === 'all';
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const kind = params.get('kind') === 'bug' ? IssueKind.BUG : IssueKind.TASK;
  const isBug = kind === IssueKind.BUG;

  const [filters, setFilters] = useState<FilterSelections>({});
  const [search, setSearch] = useState('');

  // Switching kind rides in the URL (shareable) and clears the filters — severity
  // is bug-only, backlog item is task-only, and the status columns differ, so
  // nothing carries across cleanly.
  const setKind = (next: IssueKind) => {
    if (next === kind) return;
    const p = new URLSearchParams(params);
    if (next === IssueKind.BUG) p.set('kind', 'bug');
    else p.delete('kind');
    setParams(p, { replace: true });
    setFilters({});
  };

  // Board is default and kept out of the URL; ?view=list | ?view=timeline are shareable.
  const viewParam = params.get('view');
  const view: 'board' | 'list' | 'timeline' =
    viewParam === 'list' ? 'list' : viewParam === 'timeline' ? 'timeline' : 'board';
  const setView = (v: 'board' | 'list' | 'timeline') => {
    const next = new URLSearchParams(params);
    if (v === 'board') next.delete('view');
    else next.set('view', v);
    setParams(next, { replace: true });
  };

  const issueType = isBug ? TeamIssueType.BUG : TeamIssueType.TASK;
  // Columns start as the *default* team's statuses for this kind — this board spans
  // teams (all of them, or my work everywhere), so it isn't scoped to one team's
  // list. `extendColumns` below adds any status the default team doesn't have.
  const defaultColumns = useTeamStatuses(undefined, issueType);
  const statusesFor = useTeamStatusesLookup();
  // Labels resolve per-item: each card carries its own teamId (see the task board).
  const labelsFor = useTeamLabelsLookup();

  const { data, isLoading } = useIssues({
    kind: [kind],
    // "Assigned to me" is strictly the assignee, never the creator. The sentinel
    // keeps that list empty (not everyone's) until the user has loaded; the
    // all-issues scope sends no `mine` at all, so the API returns the workspace.
    mine: isAll ? undefined : user?.id ?? '__none__',
    search: search || undefined,
    status: filters.status,
    // Filtering by person only means something when the list isn't already one person's.
    assigneeId: isAll ? filters.assigneeId : undefined,
    severity: isBug ? (filters.severity as BugSeverity[] | undefined) : undefined,
    projectId: filters.projectId,
    roadmapItemId: isBug ? undefined : filters.roadmapItemId,
  });
  const items = data?.items ?? [];
  // A board titled "All issues" must not hide a row it has no column for, so any
  // status present on a fetched issue but missing from the default team's set is
  // appended (see `extendColumns`).
  const columns = isAll
    ? extendColumns(defaultColumns, items, (teamId) => statusesFor(teamId, issueType))
    : defaultColumns;
  // The API caps a page at 100 (`PaginationDto`), like every other board here —
  // say so rather than looking complete.
  const capped = (data?.total ?? 0) > items.length;

  const setStatus = useSetIssueStatus();
  const remove = useDeleteIssue();

  // Both kinds open their own full create page, carrying the column when added
  // from one. Neither carries a team: this board spans teams, so a new issue
  // lands in the workspace default — which is what it already did.
  const openCreate = (status?: string) => {
    const base = isBug ? '/bugs/new' : '/tasks/new';
    navigate(status ? `${base}?status=${encodeURIComponent(status)}` : base);
  };

  // Only needed to label the filter options — people only on the all-issues board.
  const { data: usersData } = useUsers({ limit: 100 }, isAll && canManageDelivery);
  const { data: projectsData } = useProjects({ limit: 100 });
  const { data: roadmaps } = useRoadmaps();

  const filterCategories: FilterCategory[] = [
    {
      id: 'status',
      label: t('roadmaps.status'),
      options: columns.map((c) => ({ id: c.key, label: c.label, color: c.color })),
    },
    // Assignee is the axis that only appears once the board isn't already one
    // person's — same shape as the team boards', self-filter first (the people
    // list is manager-only, so a member can still narrow to their own).
    ...(isAll
      ? [
          {
            id: 'assigneeId',
            label: t('filters.assignee'),
            searchable: true,
            options: [
              ...(user ? [{ id: user.id, label: t('filters.assignedToMe') }] : []),
              { id: UNASSIGNED, label: t('filters.unassigned') },
              ...(usersData?.items ?? [])
                .filter((u) => u.id !== user?.id)
                .map((u) => ({ id: u.id, label: u.name })),
            ],
          },
        ]
      : []),
    // Severity is a bug-only axis; backlog item is task-only.
    ...(isBug
      ? [
          {
            id: 'severity',
            label: t('bugs.severity'),
            options: BUG_SEVERITIES.map((s) => ({
              id: s,
              label: BUG_SEVERITY_LABEL[s],
              color: BUG_SEVERITY_COLOR[s],
            })),
          },
        ]
      : [
          {
            id: 'roadmapItemId',
            label: t('filters.backlogItem'),
            searchable: true,
            // Flattened across roadmaps and prefixed, so same-named items stay distinct.
            options: (roadmaps ?? []).flatMap((r) =>
              (r.items ?? []).map((i) => ({ id: i.id, label: `${r.title} · ${i.title}` })),
            ),
          },
        ]),
    {
      id: 'projectId',
      label: t('filters.project'),
      searchable: true,
      options: (projectsData?.items ?? []).map((p) => ({ id: p.id, label: p.title })),
    },
  ];

  /** Issues don't persist ordering, so the drop slot is ignored — only the
   * destination column matters. */
  function onMove(id: string, toStatus: string) {
    const it = items.find((x) => x.id === id);
    if (it && it.status !== toStatus) setStatus.mutate({ id, status: toStatus });
  }

  // One detail URL for both kinds — `/issues/<ref>` works out the kind itself.
  const openIssue = (it: IssueDto) => navigate(`/issues/${it.shortId || it.id}`);

  return (
    <IssueBoardLayout
      title={isAll ? t('issues.allTitle') : t('tasks.assignedToMe')}
      subtitle={isAll ? t('issues.allSubtitle') : t('issues.mySubtitle')}
      search={{
        value: search,
        onChange: setSearch,
        placeholder: isBug ? t('bugs.search') : t('tasks.search'),
      }}
      filters={
        <div className="flex items-center gap-2 sm:gap-3">
          <KindSwitch value={kind} onChange={setKind} />
          <FilterMenu size="default" categories={filterCategories} value={filters} onChange={setFilters} />
        </div>
      }
      filtersEnd={
        capped ? (
          <p className="text-xs text-muted-foreground">
            <span className="tabular-nums">
              {items.length} / {data?.total}
            </span>{' '}
            {t('issues.cappedHint')}
          </p>
        ) : undefined
      }
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
        canWrite ? (
          <Button onClick={() => openCreate()}>+ {isBug ? t('bugs.new') : t('tasks.new')}</Button>
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
      ) : items.length === 0 ? (
        <div className="mx-4 rounded-xl border border-dashed p-8 text-center md:mx-8">
          <p className="text-muted-foreground">
            {isAll ? t('issues.emptyAll') : isBug ? t('bugs.empty') : t('tasks.none')}
          </p>
          {canWrite && (
            <Button size="sm" className="mt-3" onClick={() => openCreate()}>
              {isBug ? t('bugs.new') : t('tasks.new')}
            </Button>
          )}
        </div>
      ) : view === 'board' ? (
        <KanbanBoard
          columns={columns}
          items={items}
          getId={(it) => it.id}
          getColumnKey={(it) => it.status}
          // IssueDto is a documented superset of Task/BugDto, but widens
          // status→string and severity→''|BugSeverity, so the narrower card props
          // reject a structural assign — the runtime shape is identical, hence the cast.
          renderCard={(it, overlay) =>
            isBug ? (
              <BugCard bug={it as unknown as BugDto} labels={labelsFor(it.teamId)} overlay={overlay} />
            ) : (
              <TaskCard task={it as unknown as TaskDto} labels={labelsFor(it.teamId)} overlay={overlay} />
            )
          }
          onMove={onMove}
          disabled={!canWrite}
          onCardClick={openIssue}
          renderCardToolbar={
            canWrite
              ? (it) => (
                  <KanbanCardToolbar
                    editLabel={t('common.edit')}
                    removeLabel={t('common.delete')}
                    onEdit={() => openIssue(it)}
                    onRemove={() => {
                      if (confirm(isBug ? t('bugs.confirmDelete') : t('tasks.confirmDelete')))
                        remove.mutate(it.id);
                    }}
                  />
                )
              : undefined
          }
          onColumnAdd={canWrite ? (col) => openCreate(col.key) : undefined}
          addLabel={isBug ? t('bugs.addToColumn') : t('tasks.addToColumn')}
        />
      ) : view === 'list' ? (
        <div className={cn('min-h-0 flex-1 overflow-y-auto pb-6', BOARD_GUTTER)}>
          <IssueList
            items={items}
            columns={columns}
            labelsFor={labelsFor}
            isBug={isBug}
            onOpen={openIssue}
          />
        </div>
      ) : (
        <div className={cn('min-h-0 flex-1 overflow-y-auto pb-6 pt-1', BOARD_GUTTER)}>
          <IssueTimelineView items={items} issueType={issueType} />
        </div>
      )}
    </IssueBoardLayout>
  );
}

/** List view — grouped by status column, mirroring the task/bug lists so all
 * three read as siblings. Leads with the bug's severity dot or a task glyph. */
function IssueList({
  items,
  columns,
  labelsFor,
  isBug,
  onOpen,
}: {
  items: IssueDto[];
  columns: TeamStatusConfig[];
  labelsFor: (teamId: string | undefined) => TaskLabelConfig[];
  isBug: boolean;
  onOpen: (item: IssueDto) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {columns.map((col) => {
        const list = items.filter((it) => it.status === col.key);
        if (list.length === 0) return null;
        return (
          <section key={col.key}>
            <div className="mb-2 flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ backgroundColor: col.color }} aria-hidden />
              <h2 className="text-sm font-medium text-foreground">{col.label}</h2>
              <span className="text-xs tabular-nums text-muted-foreground">{list.length}</span>
            </div>
            <div className="rounded-xl border bg-card p-2 text-card-foreground shadow-sm">
              {list.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onOpen(it)}
                  className="flex w-full items-center gap-3 rounded-md px-4 py-3 text-left text-foreground transition-colors hover:bg-accent [&:not(:last-child)]:border-b"
                >
                  {isBug && it.severity ? (
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: BUG_SEVERITY_COLOR[it.severity] }}
                      title={BUG_SEVERITY_LABEL[it.severity]}
                    />
                  ) : (
                    <Icon name="tasks" size={14} className="shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm">{it.title}</span>
                  <LabelChips
                    keys={it.labelKeys}
                    labels={labelsFor(it.teamId)}
                    max={3}
                    className="hidden shrink-0 sm:flex"
                  />
                  {it.shortId && (
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{it.shortId}</span>
                  )}
                  <AssigneeBadge
                    assignees={it.assignees}
                    unassignedLabel={t('tasks.unassigned')}
                    className="max-w-[35%] shrink-0"
                  />
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
