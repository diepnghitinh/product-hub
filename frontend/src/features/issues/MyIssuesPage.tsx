import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarRange, LayoutGrid, List } from 'lucide-react';
import { Badge, Button, Spinner } from '@/components/ui';
import { BOARD_GUTTER, IssueBoardLayout } from '@/components/IssueBoardLayout';
import { KanbanBoard, KanbanCardToolbar } from '@/components/KanbanBoard';
import { Icon } from '@/components/Icon';
import { IssueTimelineView } from '@/features/issues/IssueTimelineView';
import { LabelChips } from '@/features/labels/LabelChips';
import { FilterMenu, type FilterCategory, type FilterSelections } from '@/components/FilterMenu';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useProjects } from '@/features/projects/api';
import { useRoadmaps } from '@/features/roadmaps/api';
import { useTeamStatuses, useTeamLabelsLookup } from '@/features/teams/api';
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
import { CreateBugDialog } from '@/features/bugs/components/CreateBugDialog';
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
 * The unified personal board — *everything assigned to me*, tasks and bugs, in one
 * place (assigned bugs used to be invisible in the task-only "Assigned to me"). A
 * Kind switch flips between the two: one kind at a time, so each keeps its own
 * status columns and card. Board / list / timeline like every other board.
 */
export function MyIssuesPage() {
  const { user, canEditDelivery: canWrite } = useAuth();
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

  // Columns are the *default* team's statuses for this kind — this board spans
  // teams (my work everywhere), so it isn't scoped to one team's list.
  const columns = useTeamStatuses(undefined, isBug ? TeamIssueType.BUG : TeamIssueType.TASK);
  // Labels resolve per-item: each card carries its own teamId (see the task board).
  const labelsFor = useTeamLabelsLookup();

  // Strictly assigned to me. The sentinel keeps the list empty (not everyone's)
  // until the user has loaded.
  const { data, isLoading } = useIssues({
    kind: [kind],
    mine: user?.id ?? '__none__',
    search: search || undefined,
    status: filters.status,
    severity: isBug ? (filters.severity as BugSeverity[] | undefined) : undefined,
    projectId: filters.projectId,
    roadmapItemId: isBug ? undefined : filters.roadmapItemId,
  });
  const items = data?.items ?? [];

  const setStatus = useSetIssueStatus();
  const remove = useDeleteIssue();

  // Bug creation opens the dialog; a task opens the full New task page (both land
  // in the default team — this board has no single team of its own).
  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<string | undefined>();
  const openCreate = (status?: string) => {
    if (isBug) {
      setCreateStatus(status);
      setCreateOpen(true);
    } else {
      navigate(status ? `/tasks/new?status=${encodeURIComponent(status)}` : '/tasks/new');
    }
  };

  // Only needed to label the filter options.
  const { data: projectsData } = useProjects({ limit: 100 });
  const { data: roadmaps } = useRoadmaps();

  const filterCategories: FilterCategory[] = [
    {
      id: 'status',
      label: t('roadmaps.status'),
      options: columns.map((c) => ({ id: c.key, label: c.label, color: c.color })),
    },
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

  const openIssue = (it: IssueDto) =>
    navigate(`/${isBug ? 'bugs' : 'tasks'}/${it.shortId || it.id}`);

  return (
    <IssueBoardLayout
      // /issues is in the nav model, so the topbar's section icon already covers
      // the heading — adding a titleIcon here would double up (same as My Tasks).
      title={t('tasks.assignedToMe')}
      subtitle={t('issues.mySubtitle')}
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
        <div className={cn('grid place-items-center rounded-xl border border-dashed p-8', BOARD_GUTTER)}>
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <div className="mx-4 rounded-xl border border-dashed p-8 text-center md:mx-8">
          <p className="text-muted-foreground">{isBug ? t('bugs.empty') : t('tasks.none')}</p>
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
          <IssueTimelineView items={items} issueType={isBug ? TeamIssueType.BUG : TeamIssueType.TASK} />
        </div>
      )}

      {createOpen && (
        <CreateBugDialog
          open={createOpen}
          onClose={() => {
            setCreateOpen(false);
            setCreateStatus(undefined);
          }}
          defaultStatus={createStatus}
        />
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
                  <Badge variant="muted" className="max-w-[35%] shrink-0 truncate">
                    {it.assigneeName || t('tasks.unassigned')}
                  </Badge>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
