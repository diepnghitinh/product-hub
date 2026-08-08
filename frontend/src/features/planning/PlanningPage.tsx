import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarRange } from 'lucide-react';
import { Icon } from '@/components/Icon';
import { ViewTabs } from '@/components/IssueBoardLayout';
import { t } from '@/i18n';
import { FullScreenLayout } from '@/layouts/shared';
import { RoadmapsPanel } from '@/features/roadmaps/RoadmapsPanel';
import { RoadmapTimelinePanel } from '@/features/roadmaps/RoadmapTimelinePanel';
import { MilestonesPanel } from '@/features/milestones/MilestonesPanel';

type PlanningTab = 'roadmaps' | 'timeline' | 'okrs';

/**
 * Roadmaps, the timeline over all of them, and OKRs — on one page behind a tab
 * strip.
 *
 * They answer one question in three parts — what we're betting on, when it lands,
 * and what "worked" would look like — and as separate pages the sidebar was the
 * only way across, which made comparing a bet to its outcome a round trip. One
 * page makes the switch a tab.
 *
 * **The tab is the URL.** `/roadmaps` and `/okrs` both land here and each opens
 * its own tab, so every existing link, favourite and breadcrumb still resolves,
 * and a tab click is a real navigation you can bookmark and go Back from. The
 * timeline is `/roadmaps?view=timeline` rather than a path of its own because
 * `/roadmaps/timeline` would be read as a roadmap called "timeline" — the id
 * route owns that segment. It's a peer tab all the same: the strip is the only
 * way to it, so nothing else has to know it's spelled with a query.
 *
 * The shell owns only the tabs. Each tab's title and primary action come from the
 * panel itself via `PageHeader`, which portals into the topbar — and so does its
 * **shape**: the two card tabs scroll a centred reading column, the timeline is a
 * board, full width with its own scroll area. Owning either up here would mean
 * deciding it on a tab's behalf.
 */
export function PlanningPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const tab: PlanningTab = pathname.startsWith('/okrs')
    ? 'okrs'
    : params.get('view') === 'timeline'
      ? 'timeline'
      : 'roadmaps';

  /** Switching tabs keeps the query — the project scope this page may be filtered
   *  to, and the timeline's own phase filter, so a there-and-back lands where you
   *  left off. Only `view` (the tab itself) is rewritten. */
  const go = (next: PlanningTab) => {
    if (next === 'okrs') return navigate('/okrs');
    const p = new URLSearchParams(params);
    if (next === 'timeline') p.set('view', 'timeline');
    else p.delete('view');
    const q = p.toString();
    navigate(q ? `/roadmaps?${q}` : '/roadmaps');
  };

  return (
    <FullScreenLayout>
      {/* The same sub-header strip the boards use, so a tabbed page reads the
          same wherever it appears in the app. */}
      <ViewTabs
        view={{
          value: tab,
          onChange: (next) => go(next as PlanningTab),
          options: [
            {
              value: 'roadmaps',
              label: t('roadmaps.title'),
              icon: <Icon name="roadmap" size={16} />,
            },
            {
              // The glyph every other board's timeline tab uses — the view is the
              // same idea here, so it gets the same label and the same icon.
              value: 'timeline',
              label: t('boards.viewTimeline'),
              icon: <CalendarRange />,
            },
            {
              value: 'okrs',
              label: t('milestones.title'),
              icon: <Icon name="milestone" size={16} />,
            },
          ],
        }}
      />

      {tab === 'okrs' ? (
        <MilestonesPanel />
      ) : tab === 'timeline' ? (
        <RoadmapTimelinePanel />
      ) : (
        <RoadmapsPanel />
      )}
    </FullScreenLayout>
  );
}
