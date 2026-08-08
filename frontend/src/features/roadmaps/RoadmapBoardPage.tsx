import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
  Gauge,
  LayoutGrid,
  MoreHorizontal,
  Table2,
  Target,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useEscapeBack } from '@/lib/useEscapeBack';
import { Badge, Button, Dialog, Menu, ProgressBar } from '@/components/ui';
import { BoardSkeleton } from '@/components/Skeletons';
import { CenteredPageLayout } from '@/layouts/shared';
import { cn } from '@/lib/utils';
import { firstImageUrl } from '@/lib/editorjs';
import { t } from '@/i18n';
import { BOARD_GUTTER, IssueBoardLayout } from '@/components/IssueBoardLayout';
import { BoardCard, BoardCardAge, KanbanBoard, KanbanCardToolbar } from '@/components/KanbanBoard';
import { FilterMenu, assigneeFilterCategory, type FilterCategory } from '@/components/FilterMenu';
import { SavedFilterChips, useSavedFilters } from '@/components/SavedFilters';
import { useUsers } from '@/features/users/api';
import {
  DEFAULT_ROADMAP_COLUMNS,
  ROADMAP_DIFFICULTY_COLOR,
  ROADMAP_DIFFICULTY_LABEL,
  ROADMAP_ITEM_STATUS_LABEL,
  RoadmapDifficulty,
  RoadmapItemStatus,
  ClickUpSyncScope,
} from '@/types/enums';
import { ClickUpSyncEditor } from '@/features/clickup/ClickUpSyncEditor';
import { RoadmapWorkflowView } from './components/RoadmapWorkflowView';
import { RoadmapGanttView } from './components/RoadmapGanttView';
import type { RoadmapEpic, RoadmapItem } from '@/types/dto';
import { RoadmapColumnsDialog } from './components/RoadmapColumnsDialog';
import { RoadmapEpicsDialog } from './components/RoadmapEpicsDialog';
import { UNGROUPED, epicIndex, epicLanes, epicOf } from './epics';
import { ShareLinkDialog } from '@/components/ShareLinkDialog';
import { RoadmapRiceChart } from './components/RoadmapRiceChart';
import { RoadmapRiceTable } from './components/RoadmapRiceTable';
import {
  useDeleteRoadmap,
  useReplaceRoadmapItems,
  useRoadmap,
  useSetRoadmapSharing,
  useUpdateRoadmap,
} from './api';

const STATUS_VARIANT: Record<RoadmapItemStatus, 'muted' | 'warning' | 'success'> = {
  [RoadmapItemStatus.IDEA]: 'muted',
  [RoadmapItemStatus.PLANNED]: 'muted',
  [RoadmapItemStatus.IN_PROGRESS]: 'warning',
  [RoadmapItemStatus.DONE]: 'success',
};

/** A fresh item for create-and-open. Title starts empty (shown as "Untitled"
 *  on the card); the new item's page autofocuses the title to fill in. */
function emptyRoadmapItem(id: string, phase: string, epicId = ''): RoadmapItem {
  return {
    id,
    title: '',
    description: '',
    phase,
    epicId,
    status: RoadmapItemStatus.IDEA,
    difficulty: RoadmapDifficulty.MEDIUM,
    reach: 3,
    impact: 3,
    confidence: 3,
    effort: 3,
    progress: 0,
    rice: 9,
    imageUrl: '',
    startDate: '',
    endDate: '',
    assignees: [],
    milestoneId: '',
    objectiveId: '',
    keyResultId: '',
    okrLabel: '',
  };
}

/** Roadmap item card visual — shared by the column list and the lifted drag overlay. */
export function RoadmapCard({
  item,
  overlay = false,
  epic,
}: {
  item: RoadmapItem;
  overlay?: boolean;
  /** The item's epic, when the caller wants it named on the card. Left out when
   *  the board is already grouped by epic — the lane has just said it. */
  epic?: RoadmapEpic;
}) {
  // Cover = the item's first description image. Prefer the persisted `imageUrl`,
  // but fall back to parsing the description so items saved before covers existed
  // (and the public read-only view) still show one.
  const cover = item.imageUrl || firstImageUrl(item.description);
  return (
    <BoardCard
      overlay={overlay}
      cover={cover || undefined}
      title={item.title || t('roadmaps.untitled')}
      titleTrailing={
        <Badge variant="secondary" className="font-mono" title="RICE score">
          {item.rice}
        </Badge>
      }
      labels={
        epic || item.okrLabel ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {/* The epic this item belongs to — carries the epic's own colour, so
                a group is recognisable at a glance across every column. */}
            {epic && (
              <Badge
                variant="muted"
                className="min-w-0 max-w-full gap-1 font-normal"
                title={`${t('roadmaps.epic')}: ${epic.label}`}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: epic.color }}
                  aria-hidden
                />
                <span className="truncate">{epic.label}</span>
              </Badge>
            )}
            {/* Linked OKR — informational chip (the denormalized objective/KR title). */}
            {item.okrLabel && (
              <Badge
                variant="muted"
                className="min-w-0 max-w-full gap-1 font-normal"
                title={item.okrLabel}
              >
                <Target className="size-3 shrink-0 text-primary" aria-hidden />
                <span className="truncate">{item.okrLabel}</span>
              </Badge>
            )}
          </div>
        ) : undefined
      }
      metaLeading={
        <Badge variant={STATUS_VARIANT[item.status]}>
          {ROADMAP_ITEM_STATUS_LABEL[item.status]}
        </Badge>
      }
      metaTrailing={
        <>
          {/* Difficulty — same dot colour as the item dialog (semantic tokens). */}
          <span className="flex items-center gap-1" title={t('roadmaps.difficulty')}>
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: ROADMAP_DIFFICULTY_COLOR[item.difficulty] }}
              aria-hidden
            />
            {ROADMAP_DIFFICULTY_LABEL[item.difficulty]}
          </span>
          {/* Age since creation — how long the item has sat, e.g. "5d" / "10d". */}
          <BoardCardAge createdAt={item.createdAt} />
        </>
      }
      progress={item.progress}
    />
  );
}

export function RoadmapBoardPage() {
  const { roadmapId } = useParams<{ roadmapId: string }>();
  const navigate = useNavigate();
  useEscapeBack();
  const { user, isAdmin, canWrite, canManageDelivery } = useAuth();

  const { data: roadmap, isLoading } = useRoadmap(roadmapId);
  const replaceItems = useReplaceRoadmapItems();
  // Columns aren't edited here at all — ⋯ → Manage columns owns them (add,
  // rename, recolour, reorder), so the board only ever reads `roadmap.columns`.
  const deleteRoadmap = useDeleteRoadmap();
  const update = useUpdateRoadmap();
  const setSharing = useSetRoadmapSharing();

  const [columnsOpen, setColumnsOpen] = useState(false);
  const [epicsOpen, setEpicsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [clickupOpen, setClickupOpen] = useState(false);
  const [sortRice, setSortRice] = useState(false);
  // Persist the board/chart view in the URL (?view=chart) so it survives reloads
  // and is shareable; `board` is the default and kept out of the query for clean URLs.
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const view: 'board' | 'chart' | 'table' | 'workflow' | 'gantt' =
    viewParam === 'chart'
      ? 'chart'
      : viewParam === 'table'
        ? 'table'
        : viewParam === 'workflow'
          ? 'workflow'
          : viewParam === 'gantt'
            ? 'gantt'
            : 'board';
  const setView = (v: 'board' | 'chart' | 'table' | 'workflow' | 'gantt') => {
    const next = new URLSearchParams(searchParams);
    if (v === 'board') next.delete('view');
    else next.set('view', v);
    setSearchParams(next, { replace: true });
  };
  // Grouping rides in the URL for the same reason the view does: "here's the
  // board, grouped by epic" has to survive a reload and be a link you can send.
  const groupByEpic = searchParams.get('group') === 'epic';
  const setGroupByEpic = (on: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (on) next.set('group', 'epic');
    else next.delete('group');
    setSearchParams(next, { replace: true });
  };

  // The timeline's Assignee filter — remembered per roadmap and saveable as a
  // named view, like every other board's. Only the timeline names people, so it's
  // the only view that offers the toolbar (the others get none, as before).
  const filterState = useSavedFilters(`roadmap:${roadmapId ?? ''}:timeline`);
  const { filters, setFilters } = filterState;
  // Shared with every `AssigneeField` on the page — same key, one fetch. Only the
  // timeline needs it, so it's skipped until you're on that view.
  const { data: usersData } = useUsers({ limit: 100 }, view === 'gantt');
  const filterCategories: FilterCategory[] = [assigneeFilterCategory(usersData?.items, user?.id)];

  if (isLoading) {
    return <BoardSkeleton />;
  }
  if (!roadmap) {
    return (
      <CenteredPageLayout>
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t('roadmaps.notFound')}{' '}
          <Link
            to="/roadmaps"
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t('roadmaps.title')}
          </Link>
        </div>
      </CenteredPageLayout>
    );
  }

  const items = roadmap.items ?? [];
  const columns = roadmap.columns?.length ? roadmap.columns : DEFAULT_ROADMAP_COLUMNS;
  const epics = roadmap.epics ?? [];
  // Sorting the whole array by RICE and then filtering per column gives the same
  // per-column order as sorting each column, so the board can take it directly.
  const boardItems = sortRice ? [...items].sort((a, b) => b.rice - a.rice) : items;
  const epicsById = epicIndex(epics);
  // Only offer grouping once there's something to group by, and only honour it
  // while that's still true — deleting the last epic can't strand the board in a
  // one-lane "grouped" state that looks broken.
  const canGroup = epics.length > 0;
  const grouped = groupByEpic && canGroup;
  const lanes = grouped
    ? epicLanes(epics, boardItems).map((lane) => ({
        key: lane.key,
        label: lane.label,
        color: lane.color,
        description: lane.description,
        // Progress, not a second count — the lane header already shows how many
        // items are in the band.
        meta: (
          <span
            className="flex items-center gap-2 text-xs text-muted-foreground"
            title={t('roadmaps.progress')}
          >
            <ProgressBar value={lane.rollup.progress} className="h-1.5 w-16 sm:w-24" />
            <span className="tabular-nums">{lane.rollup.progress}%</span>
          </span>
        ),
      }))
    : undefined;

  function save(next: RoadmapItem[]) {
    replaceItems.mutate({ id: roadmap!.id, items: next });
  }
  /** Open by ref (`…/items/RM-6HCUHKX`) — callers hand us the uuid they're
   *  holding, so the ref is looked up here rather than at every call site.
   *  Falls back to the uuid for items minted before refs existed. */
  const openItem = (id: string) => {
    const ref = items.find((i) => i.id === id)?.shortId || id;
    navigate(`/roadmaps/${roadmap!.id}/items/${ref}`);
  };
  /** Create-and-open: a new "Untitled" item is added to the column and its page
   *  opens immediately to fill in — no dialog. Started from inside a lane, it
   *  arrives already in that epic. */
  function createItem(phase: string, epicId = '') {
    const id = crypto.randomUUID();
    save([...items, emptyRoadmapItem(id, phase, epicId)]);
    navigate(`/roadmaps/${roadmap!.id}/items/${id}`);
  }
  function removeItem(id: string) {
    if (confirm(t('roadmaps.confirmDeleteItem'))) save(items.filter((i) => i.id !== id));
  }
  /** Reorder is persisted as the items array's order, so a move splices the
   * dragged item into the raw array (not the RICE-sorted view).
   *
   * `toEpic` only arrives while the board is grouped — one drag then writes both
   * coordinates, so dragging a card into another epic's lane *is* how you
   * regroup it. It's `undefined` on the plain board, which leaves `epicId` alone. */
  function onMove(id: string, toPhase: string, overId: string | null, toEpic?: string) {
    const dragged = items.find((i) => i.id === id);
    if (!dragged) return;
    const moved = { ...dragged, phase: toPhase, ...(toEpic !== undefined && { epicId: toEpic }) };

    const without = items.filter((i) => i.id !== id);
    if (overId) {
      const idx = without.findIndex((i) => i.id === overId);
      without.splice(idx < 0 ? without.length : idx, 0, moved);
    } else {
      // Dropped on a cell's empty area → append after that cell's last item.
      let insertAt = without.length;
      for (let k = without.length - 1; k >= 0; k--) {
        const sameCell =
          without[k].phase === toPhase &&
          (toEpic === undefined || (without[k].epicId ?? '') === toEpic);
        if (sameCell) {
          insertAt = k + 1;
          break;
        }
      }
      without.splice(insertAt, 0, moved);
    }
    save(without);
  }

  return (
    // Same shell as every team board now — the view switch, title and actions
    // are the layout's job, so this page only describes what goes in them.
    <IssueBoardLayout
      title={roadmap.title}
      subtitle={roadmap.description}
      titleLabel={t('roadmaps.rename')}
      // Mirrors `@Roles(ADMIN, TESTER, PRODUCT)` on `PATCH /roadmaps/:id` —
      // the same gate the board's drag already uses.
      onTitleChange={
        canWrite ? (title) => update.mutate({ id: roadmap.id, input: { title } }) : undefined
      }
      // Only the timeline narrows by person, so it's the only view with a toolbar
      // row — every other view keeps the board's "nothing to narrow" shape.
      filters={
        view === 'gantt' ? (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <FilterMenu
              size="default"
              categories={filterCategories}
              value={filters}
              onChange={setFilters}
            />
            <SavedFilterChips state={filterState} categories={filterCategories} />
          </div>
        ) : undefined
      }
      view={{
        value: view,
        onChange: (v) => setView(v as 'board' | 'chart' | 'table' | 'workflow' | 'gantt'),
        options: [
          { value: 'board', label: t('roadmaps.viewBoard'), icon: <LayoutGrid /> },
          { value: 'chart', label: t('roadmaps.viewChart'), icon: <BarChart3 /> },
          { value: 'table', label: t('roadmaps.viewTable'), icon: <Table2 /> },
          { value: 'workflow', label: t('roadmaps.viewWorkflow'), icon: <Gauge /> },
          { value: 'gantt', label: t('roadmaps.viewGantt'), icon: <CalendarDays /> },
        ],
      }}
      actions={
        <>
          {/* One toggle for the three views that can group — board, table and
              timeline read the same grouping, so switching view keeps it. Only
              offered once there's an epic to group by, otherwise it's a toggle
              that visibly does nothing. */}
          {canGroup && (view === 'board' || view === 'table' || view === 'gantt') && (
            <Button
              variant={grouped ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setGroupByEpic(!grouped)}
            >
              {t('roadmaps.groupByEpic')}
            </Button>
          )}
          {view === 'board' && (
            <Button
              variant={sortRice ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setSortRice((v) => !v)}
            >
              {t('roadmaps.sortRice')}
            </Button>
          )}
          {(canManageDelivery || isAdmin) && (
            <Menu
              align="right"
              triggerClassName="size-8 rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              trigger={
                <>
                  <MoreHorizontal className="size-4" aria-hidden />
                  <span className="sr-only">{t('common.more')}</span>
                </>
              }
              items={[
                ...(canManageDelivery
                  ? [
                      { label: t('roadmaps.manageColumns'), onClick: () => setColumnsOpen(true) },
                      { label: t('roadmaps.manageEpics'), onClick: () => setEpicsOpen(true) },
                      { label: t('share.share'), onClick: () => setShareOpen(true) },
                    ]
                  : []),
                ...(isAdmin
                  ? [
                      // A backlog has no settings page of its own, so its ClickUp
                      // binding lives here, beside the columns it maps. Admin-only,
                      // like the endpoints behind it.
                      { label: t('clickup.sync'), onClick: () => setClickupOpen(true) },
                      {
                        label: t('roadmaps.delete'),
                        danger: true,
                        onClick: () => {
                          if (confirm(t('roadmaps.confirmDelete')))
                            deleteRoadmap.mutate(roadmap.id, {
                              onSuccess: () => navigate('/roadmaps'),
                            });
                        },
                      },
                    ]
                  : []),
              ]}
            />
          )}
        </>
      }
    >
      {view === 'board' ? (
        <KanbanBoard
          columns={columns}
          items={boardItems}
          getId={(i) => i.id}
          getColumnKey={(i) => i.phase}
          swimlanes={lanes}
          getSwimlaneKey={(i) => i.epicId ?? UNGROUPED}
          renderCard={(item, overlay) => (
            // Grouped, the lane already names the epic — repeating it on every
            // card in the band is noise.
            <RoadmapCard
              item={item}
              overlay={overlay}
              epic={grouped ? undefined : epicOf(item, epicsById)}
            />
          )}
          onMove={onMove}
          disabled={!canWrite}
          onCardClick={(item) => openItem(item.id)}
          renderCardToolbar={
            canWrite
              ? (item) => (
                  <KanbanCardToolbar
                    editLabel={t('common.edit')}
                    removeLabel={t('common.delete')}
                    onEdit={() => openItem(item.id)}
                    onRemove={() => removeItem(item.id)}
                  />
                )
              : undefined
          }
          onColumnAdd={canWrite ? (col, lane) => createItem(col.key, lane?.key) : undefined}
          addLabel={t('roadmaps.addItem')}
        />
      ) : (
        <div className={cn('min-h-0 flex-1 overflow-y-auto py-4 md:py-6', BOARD_GUTTER)}>
          {view === 'chart' ? (
            <div className="mx-auto w-full sm:w-1/2">
              <RoadmapRiceChart items={items} columns={columns} />
            </div>
          ) : view === 'workflow' ? (
            <RoadmapWorkflowView items={items} />
          ) : view === 'gantt' ? (
            // The timeline peeks a row in a drawer rather than navigating — it owns
            // both drawers, so it needs no open-item callback from here.
            <RoadmapGanttView
              roadmapId={roadmap.id}
              items={items}
              columns={columns}
              epics={epics}
              groupByEpic={grouped}
              assigneeIds={filters.assigneeId}
            />
          ) : (
            <RoadmapRiceTable
              items={items}
              columns={columns}
              epics={epics}
              groupByEpic={grouped}
              onOpen={(item) => openItem(item.id)}
            />
          )}
        </div>
      )}

      {columnsOpen && (
        <RoadmapColumnsDialog
          open={columnsOpen}
          onClose={() => setColumnsOpen(false)}
          roadmapId={roadmap.id}
          columns={columns}
          items={items}
        />
      )}
      {epicsOpen && (
        <RoadmapEpicsDialog
          open={epicsOpen}
          onClose={() => setEpicsOpen(false)}
          roadmapId={roadmap.id}
          epics={epics}
          items={items}
        />
      )}
      {shareOpen && (
        <ShareLinkDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          title={t('share.titleRoadmap')}
          hint={t('share.roadmapHint')}
          publicPath="roadmaps"
          enabled={roadmap.publicEnabled}
          publicToken={roadmap.publicToken}
          pending={setSharing.isPending}
          onToggle={(enabled) => setSharing.mutate({ id: roadmap.id, enabled })}
        />
      )}
      {clickupOpen && (
        <Dialog
          open={clickupOpen}
          onClose={() => setClickupOpen(false)}
          title={t('clickup.sync')}
          className="max-w-2xl"
          footer={
            <Button variant="ghost" onClick={() => setClickupOpen(false)}>
              {t('common.close')}
            </Button>
          }
        >
          <p className="mb-4 text-sm text-muted-foreground">{t('clickup.syncHint')}</p>
          <ClickUpSyncEditor
            scope={ClickUpSyncScope.ROADMAP}
            scopeId={roadmap.id}
            variant="plain"
          />
        </Dialog>
      )}
    </IssueBoardLayout>
  );
}
