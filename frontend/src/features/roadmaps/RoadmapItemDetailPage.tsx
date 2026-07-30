import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEscapeBack } from '@/lib/useEscapeBack';
import { t } from '@/i18n';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { CenteredPageLayout } from '@/layouts/shared';
import { useRoadmap } from './api';
import { RoadmapItemDetail } from './components/RoadmapItemDetail';

/**
 * One backlog (roadmap) item's detail: the breadcrumb chrome around the shared,
 * embeddable {@link RoadmapItemDetail} — which also renders inside the timeline's
 * peek drawer. Mirrors TaskDetailPage → TaskDetail, so the two read as one product.
 */
export function RoadmapItemDetailPage() {
  const { roadmapId, itemId } = useParams<{ roadmapId: string; itemId: string }>();
  const navigate = useNavigate();
  useEscapeBack();

  // Fetched only for the crumb (roadmap + item title) and the ref rewrite below;
  // <RoadmapItemDetail> re-reads the same query (React Query dedupes it).
  const { data: roadmap } = useRoadmap(roadmapId);
  const items = roadmap?.items ?? [];
  const wanted = itemId?.toUpperCase();
  const item =
    items.find((i) => i.shortId && i.shortId.toUpperCase() === wanted) ??
    items.find((i) => i.id === itemId);

  // Once the ref is known, rewrite the address bar to it (replace, so Back still
  // leaves the page). A uuid link keeps working; it just doesn't stay on screen.
  const canonicalRef = item?.shortId;
  useEffect(() => {
    if (roadmap && canonicalRef && canonicalRef !== itemId) {
      navigate(`/roadmaps/${roadmap.id}/items/${canonicalRef}`, { replace: true });
    }
  }, [roadmap?.id, canonicalRef, itemId]);

  return (
    <CenteredPageLayout>
      {/* Breadcrumb: the roadmap's board › this item. The favourite star and the
          ⋯ menu portal up beside it from the detail body. */}
      <PageHeader
        title={item?.title || (roadmap ? t('roadmaps.untitled') : '')}
        parent={{
          to: roadmap ? `/roadmaps/${roadmap.id}` : '/roadmaps',
          label: roadmap?.title ?? t('roadmaps.title'),
        }}
      />

      <RoadmapItemDetail
        roadmapId={roadmapId}
        itemId={itemId}
        menuTarget="topbar"
        onDeleted={() => navigate(`/roadmaps/${roadmapId}`)}
      />
    </CenteredPageLayout>
  );
}
