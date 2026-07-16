import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Badge, Button, ProgressBar, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { BackLink } from '@/components/BackLink';
import {
  ROADMAP_ITEM_STATUS_LABEL,
  ROADMAP_PHASE_LABEL,
  ROADMAP_PHASES,
  Role,
  RoadmapItemStatus,
  RoadmapPhase,
} from '@/types/enums';
import type { RoadmapItem } from '@/types/dto';
import { RoadmapItemDialog } from './components/RoadmapItemDialog';
import { RoadmapRiceChart } from './components/RoadmapRiceChart';
import { useDeleteRoadmap, useReplaceRoadmapItems, useRoadmap } from './api';

// Mobile-first: columns stack vertically on small screens, then become a
// horizontally-scrollable multi-column board from `sm` up.
const BOARD =
  'grid grid-cols-1 gap-4 sm:grid-cols-none sm:grid-flow-col sm:auto-cols-[minmax(220px,1fr)] sm:overflow-x-auto sm:pb-3';

const STATUS_VARIANT: Record<RoadmapItemStatus, 'muted' | 'warning' | 'success'> = {
  [RoadmapItemStatus.IDEA]: 'muted',
  [RoadmapItemStatus.PLANNED]: 'muted',
  [RoadmapItemStatus.IN_PROGRESS]: 'warning',
  [RoadmapItemStatus.DONE]: 'success',
};

export function RoadmapBoardPage() {
  const { roadmapId } = useParams<{ roadmapId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = user?.role === Role.ADMIN || user?.role === Role.TESTER;
  const isAdmin = user?.role === Role.ADMIN;

  const { data: roadmap, isLoading } = useRoadmap(roadmapId);
  const replaceItems = useReplaceRoadmapItems();
  const deleteRoadmap = useDeleteRoadmap();

  const [dialogItem, setDialogItem] = useState<RoadmapItem | null>(null);
  const [dialogPhase, setDialogPhase] = useState<RoadmapPhase>(RoadmapPhase.NOW);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sortRice, setSortRice] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'chart'>('board');

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

  function save(next: RoadmapItem[]) {
    replaceItems.mutate({ id: roadmap!.id, items: next });
  }
  function upsertItem(item: RoadmapItem) {
    const exists = items.some((i) => i.id === item.id);
    save(exists ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item]);
    setDialogOpen(false);
  }
  function removeItem(id: string) {
    if (confirm(t('roadmaps.confirmDeleteItem'))) save(items.filter((i) => i.id !== id));
  }
  function movePhase(id: string, phase: RoadmapPhase) {
    const item = items.find((i) => i.id === id);
    if (item && item.phase !== phase) save(items.map((i) => (i.id === id ? { ...i, phase } : i)));
    setDragId(null);
  }

  function itemsFor(phase: RoadmapPhase): RoadmapItem[] {
    const list = items.filter((i) => i.phase === phase);
    return sortRice ? [...list].sort((a, b) => b.rice - a.rice) : list;
  }

  return (
    <div>
      <BackLink to="/roadmaps">{t('roadmaps.title')}</BackLink>

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{roadmap.title}</h1>
          {roadmap.description && (
            <p className="mt-1 text-sm text-muted-foreground">{roadmap.description}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5">
            <button
              type="button"
              className={cn(
                'rounded px-3 py-1 text-sm transition-colors',
                view === 'board'
                  ? 'bg-accent font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setView('board')}
            >
              Board
            </button>
            <button
              type="button"
              className={cn(
                'rounded px-3 py-1 text-sm transition-colors',
                view === 'chart'
                  ? 'bg-accent font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setView('chart')}
            >
              RICE chart
            </button>
          </div>
          {view === 'board' && (
            <Button variant={sortRice ? 'primary' : 'secondary'} size="sm" onClick={() => setSortRice((v) => !v)}>
              {t('roadmaps.sortRice')}
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm(t('roadmaps.confirmDelete')))
                  deleteRoadmap.mutate(roadmap.id, { onSuccess: () => navigate('/roadmaps') });
              }}
            >
              {t('roadmaps.delete')}
            </Button>
          )}
        </div>
      </header>

      {view === 'chart' ? (
        <RoadmapRiceChart items={items} />
      ) : (
      <div className={BOARD}>
        {ROADMAP_PHASES.map((phase) => (
          <div
            key={phase}
            className="flex min-h-[120px] flex-col rounded-xl border bg-card p-3"
            onDragOver={(e) => canWrite && e.preventDefault()}
            onDrop={() => canWrite && dragId && movePhase(dragId, phase)}
          >
            <div className="flex items-center justify-between px-1.5 pb-3 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>{ROADMAP_PHASE_LABEL[phase]}</span>
              {canWrite && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-base"
                  aria-label="Add item"
                  onClick={() => {
                    setDialogItem(null);
                    setDialogPhase(phase);
                    setDialogOpen(true);
                  }}
                >
                  +
                </Button>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {itemsFor(phase).map((item) => (
                <article
                  key={item.id}
                  className="group relative flex cursor-pointer flex-col gap-1.5 rounded-xl border bg-card p-3 text-card-foreground shadow-sm transition-colors hover:border-foreground/20"
                  draggable={canWrite}
                  onDragStart={() => setDragId(item.id)}
                  onClick={() => {
                    if (!canWrite) return;
                    setDialogItem(item);
                    setDialogOpen(true);
                  }}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <span className="min-w-0 text-[13px] leading-snug">{item.title}</span>
                    <Badge variant="secondary" className="shrink-0 font-mono" title="RICE score">
                      {item.rice}
                    </Badge>
                  </div>
                  <Badge variant={STATUS_VARIANT[item.status]} className="self-start">
                    {ROADMAP_ITEM_STATUS_LABEL[item.status]}
                  </Badge>
                  <ProgressBar value={item.progress} />
                  {canWrite && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 size-6 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeItem(item.id);
                      }}
                    >
                      ×
                    </Button>
                  )}
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
      )}

      {dialogOpen && (
        <RoadmapItemDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          item={dialogItem ?? undefined}
          defaultPhase={dialogPhase}
          onSave={upsertItem}
        />
      )}
    </div>
  );
}
