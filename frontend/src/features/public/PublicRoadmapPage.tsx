import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { BarChart3, Gauge, LayoutGrid, Table2 } from 'lucide-react';
import { Spinner } from '@/components/ui';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { BOARD_GUTTER, ViewTabs } from '@/components/IssueBoardLayout';
import { KanbanBoard } from '@/components/KanbanBoard';
import { RoadmapCard } from '@/features/roadmaps/RoadmapBoardPage';
import { RoadmapRiceChart } from '@/features/roadmaps/components/RoadmapRiceChart';
import { RoadmapRiceTable } from '@/features/roadmaps/components/RoadmapRiceTable';
import { RoadmapWorkflowView } from '@/features/roadmaps/components/RoadmapWorkflowView';
import { DEFAULT_ROADMAP_COLUMNS } from '@/types/enums';
import type { RoadmapItem } from '@/types/dto';
import { usePublicRoadmap } from './api';
import { PublicShell } from './PublicShell';
import { PublicRoadmapItemDialog } from './PublicRoadmapItemDialog';

const noop = () => {};

type RoadmapView = 'board' | 'chart' | 'table' | 'workflow';

/**
 * A roadmap board shared read-only. Reuses the app's `KanbanBoard` + card, plus
 * the same chart/table/workflow views the authenticated board offers — just
 * without drag / add / edit affordances. Gantt is left out: it also needs the
 * roadmap's linked tasks, which the public payload doesn't carry.
 */
export function PublicRoadmapPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = usePublicRoadmap(token);
  const [openItem, setOpenItem] = useState<RoadmapItem | null>(null);

  // Board is the default and kept out of the URL; ?view=chart|table|workflow
  // survive reloads and are shareable (same pattern as the authenticated board).
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const view: RoadmapView =
    viewParam === 'chart'
      ? 'chart'
      : viewParam === 'table'
        ? 'table'
        : viewParam === 'workflow'
          ? 'workflow'
          : 'board';
  const setView = (v: RoadmapView) => {
    const next = new URLSearchParams(searchParams);
    if (v === 'board') next.delete('view');
    else next.set('view', v);
    setSearchParams(next, { replace: true });
  };

  if (isLoading) {
    return (
      <PublicShell>
        <div className="grid flex-1 place-items-center">
          <Spinner />
        </div>
      </PublicShell>
    );
  }
  if (isError || !data) {
    return (
      <PublicShell>
        <div className="grid flex-1 place-items-center p-6 text-muted-foreground">
          {t('public.notAvailable')}
        </div>
      </PublicShell>
    );
  }

  const { roadmap } = data;
  const columns = roadmap.columns?.length ? roadmap.columns : DEFAULT_ROADMAP_COLUMNS;
  const items = roadmap.items;

  return (
    <PublicShell title={roadmap.title}>
      {roadmap.description && (
        <p className="shrink-0 border-b px-4 py-2 text-center text-sm text-muted-foreground sm:px-6">
          {roadmap.description}
        </p>
      )}
      <ViewTabs
        view={{
          value: view,
          onChange: (v) => setView(v as RoadmapView),
          options: [
            { value: 'board', label: t('roadmaps.viewBoard'), icon: <LayoutGrid /> },
            { value: 'chart', label: t('roadmaps.viewChart'), icon: <BarChart3 /> },
            { value: 'table', label: t('roadmaps.viewTable'), icon: <Table2 /> },
            { value: 'workflow', label: t('roadmaps.viewWorkflow'), icon: <Gauge /> },
          ],
        }}
      />
      {view === 'board' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <KanbanBoard
            columns={columns}
            items={items}
            getId={(i) => i.id}
            getColumnKey={(i) => i.phase}
            renderCard={(item, overlay) => <RoadmapCard item={item} overlay={overlay} />}
            onMove={noop}
            disabled
            onCardClick={(item) => setOpenItem(item)}
          />
        </div>
      ) : (
        <div className={cn('min-h-0 flex-1 overflow-y-auto py-4 md:py-6', BOARD_GUTTER)}>
          {view === 'chart' ? (
            <div className="mx-auto w-full sm:w-1/2">
              <RoadmapRiceChart items={items} columns={columns} />
            </div>
          ) : view === 'workflow' ? (
            <RoadmapWorkflowView items={items} />
          ) : (
            <RoadmapRiceTable items={items} columns={columns} onOpen={(item) => setOpenItem(item)} />
          )}
        </div>
      )}
      {openItem && (
        <PublicRoadmapItemDialog item={openItem} columns={columns} onClose={() => setOpenItem(null)} />
      )}
    </PublicShell>
  );
}
