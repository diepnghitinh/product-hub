import { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Drawer, Spinner } from '@/components/ui';
import { t } from '@/i18n';

// Lazy for the same reason the issue peek is: the detail pulls in the rich-text
// editor, the comment thread and the linked-task panel. A board that only shows
// the timeline shouldn't pay for all of it until something is actually opened.
const RoadmapItemDetail = lazy(() =>
  import('./RoadmapItemDetail').then((m) => ({ default: m.RoadmapItemDetail })),
);

export interface RoadmapItemPeek {
  roadmapId: string;
  /** The item's ref (`RM-6HCUHKX`) or its uuid — both resolve. */
  itemId: string;
  /** Where "open full page" navigates. */
  href: string;
}

/**
 * A right-side slide-over previewing one backlog (roadmap) item in place — opened
 * from the timeline so you can read or edit it without leaving the chart. Renders
 * the same embeddable detail the full route shows (`menuTarget="header" dense`, so
 * its ⋯ menu + favourite stay inside the panel), with an "open full page" link in
 * the header. The sibling of {@link IssuePeekDrawer}, deliberately identical.
 */
export function RoadmapItemPeekDrawer({
  peek,
  onClose,
}: {
  peek: RoadmapItemPeek | null;
  onClose: () => void;
}) {
  if (!peek) return null;
  return (
    <Drawer
      open
      onClose={onClose}
      title={t('common.details')}
      headerActions={
        <Link
          to={peek.href}
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="size-3.5" aria-hidden />
          {t('common.openFull')}
        </Link>
      }
    >
      <Suspense
        fallback={
          <div className="grid place-items-center py-16">
            <Spinner />
          </div>
        }
      >
        <RoadmapItemDetail
          roadmapId={peek.roadmapId}
          itemId={peek.itemId}
          onDeleted={onClose}
          menuTarget="header"
          dense
        />
      </Suspense>
    </Drawer>
  );
}
