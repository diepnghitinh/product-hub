import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BarChart3, CalendarDays, Gauge, LayoutGrid, MoreHorizontal, Table2, Target } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Menu, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { firstImageUrl } from '@/lib/editorjs';
import { t } from '@/i18n';
import { BOARD_GUTTER, IssueBoardLayout } from '@/components/IssueBoardLayout';
import { BoardCard, BoardCardAge, KanbanBoard, KanbanCardToolbar } from '@/components/KanbanBoard';
import {
  DEFAULT_ROADMAP_COLUMNS,
  ROADMAP_DIFFICULTY_COLOR,
  ROADMAP_DIFFICULTY_LABEL,
  ROADMAP_ITEM_STATUS_LABEL,
  RoadmapDifficulty,
  RoadmapItemStatus,
} from '@/types/enums';
import { RoadmapWorkflowView } from './components/RoadmapWorkflowView';
import { RoadmapGanttView } from './components/RoadmapGanttView';
import type { RoadmapItem } from '@/types/dto';
import { RoadmapColumnsDialog } from './components/RoadmapColumnsDialog';
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
function emptyRoadmapItem(id: string, phase: string): RoadmapItem {
  return {
    id,
    title: '',
    description: '',
    phase,
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
    assignees: [],
    milestoneId: '',
    objectiveId: '',
    keyResultId: '',
    okrLabel: '',
  };
}

/** Roadmap item card visual — shared by the column list and the lifted drag overlay. */
export function RoadmapCard({ item, overlay = false }: { item: RoadmapItem; overlay?: boolean }) {
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
        item.okrLabel ? (
          // Linked OKR — informational chip (the denormalized objective/KR title).
          <Badge variant="muted" className="min-w-0 max-w-full gap-1 font-normal" title={item.okrLabel}>
            <Target className="size-3 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{item.okrLabel}</span>
          </Badge>
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
  const { isAdmin, canWrite, canManageDelivery } = useAuth();

  const { data: roadmap, isLoading } = useRoadmap(roadmapId);
  const replaceItems = useReplaceRoadmapItems();
  const deleteRoadmap = useDeleteRoadmap();
  const update = useUpdateRoadmap();
  const setSharing = useSetRoadmapSharing();

  const [columnsOpen, setColumnsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
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

  if (isLoading) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed p-8">
        <Spinner />
      </div>
    );
  }
  if (!roadmap) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        {t('roadmaps.notFound')}{' '}
        <Link
          to="/roadmaps"
          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t('roadmaps.title')}
        </Link>
      </div>
    );
  }

  const items = roadmap.items ?? [];
  const columns = roadmap.columns?.length ? roadmap.columns : DEFAULT_ROADMAP_COLUMNS;
  // Sorting the whole array by RICE and then filtering per column gives the same
  // per-column order as sorting each column, so the board can take it directly.
  const boardItems = sortRice ? [...items].sort((a, b) => b.rice - a.rice) : items;

  function save(next: RoadmapItem[]) {
    replaceItems.mutate({ id: roadmap!.id, items: next });
  }
  const openItem = (id: string) => navigate(`/roadmaps/${roadmap!.id}/items/${id}`);
  /** Create-and-open: a new "Untitled" item is added to the column and its page
   *  opens immediately to fill in — no dialog. */
  function createItem(phase: string) {
    const id = crypto.randomUUID();
    save([...items, emptyRoadmapItem(id, phase)]);
    navigate(`/roadmaps/${roadmap!.id}/items/${id}`);
  }
  function removeItem(id: string) {
    if (confirm(t('roadmaps.confirmDeleteItem'))) save(items.filter((i) => i.id !== id));
  }
  /** Reorder is persisted as the items array's order, so a move splices the
   * dragged item into the raw array (not the RICE-sorted view). */
  function onMove(id: string, toPhase: string, overId: string | null) {
    const dragged = items.find((i) => i.id === id);
    if (!dragged) return;
    const moved = { ...dragged, phase: toPhase };

    const without = items.filter((i) => i.id !== id);
    if (overId) {
      const idx = without.findIndex((i) => i.id === overId);
      without.splice(idx < 0 ? without.length : idx, 0, moved);
    } else {
      // Dropped on a column's empty area → append after that column's last item.
      let insertAt = without.length;
      for (let k = without.length - 1; k >= 0; k--) {
        if (without[k].phase === toPhase) {
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
                      { label: t('share.share'), onClick: () => setShareOpen(true) },
                    ]
                  : []),
                ...(isAdmin
                  ? [
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
          renderCard={(item, overlay) => <RoadmapCard item={item} overlay={overlay} />}
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
          onColumnAdd={canWrite ? (col) => createItem(col.key) : undefined}
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
            <RoadmapGanttView
              roadmapId={roadmap.id}
              items={items}
              columns={columns}
              onOpenItem={openItem}
            />
          ) : (
            <RoadmapRiceTable
              items={items}
              columns={columns}
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
    </IssueBoardLayout>
  );
}
