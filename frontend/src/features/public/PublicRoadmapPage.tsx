import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { t } from '@/i18n';
import { KanbanBoard } from '@/components/KanbanBoard';
import { RoadmapCard } from '@/features/roadmaps/RoadmapBoardPage';
import { DEFAULT_ROADMAP_COLUMNS } from '@/types/enums';
import type { RoadmapItem } from '@/types/dto';
import { usePublicRoadmap } from './api';
import { PublicShell } from './PublicShell';
import { PublicRoadmapItemDialog } from './PublicRoadmapItemDialog';

const noop = () => {};

/** A roadmap board shared read-only. Reuses the app's `KanbanBoard` + card, just
 * without drag / add / edit affordances. */
export function PublicRoadmapPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = usePublicRoadmap(token);
  const [openItem, setOpenItem] = useState<RoadmapItem | null>(null);

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

  return (
    <PublicShell>
      <div className="shrink-0 border-b px-4 py-4 sm:px-6">
        <h1 className="text-xl font-semibold tracking-tight">{roadmap.title}</h1>
        {roadmap.description && (
          <p className="mt-1 text-sm text-muted-foreground">{roadmap.description}</p>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <KanbanBoard
          columns={columns}
          items={roadmap.items}
          getId={(i) => i.id}
          getColumnKey={(i) => i.phase}
          renderCard={(item, overlay) => <RoadmapCard item={item} overlay={overlay} />}
          onMove={noop}
          disabled
          onCardClick={(item) => setOpenItem(item)}
        />
      </div>
      {openItem && (
        <PublicRoadmapItemDialog
          item={openItem}
          columns={columns}
          onClose={() => setOpenItem(null)}
        />
      )}
    </PublicShell>
  );
}
