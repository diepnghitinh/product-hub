import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { ViewTabs } from '@/components/IssueBoardLayout';
import { t } from '@/i18n';
import { FullScreenLayout } from '@/layouts/shared';
import { RoadmapsPanel } from '@/features/roadmaps/RoadmapsPanel';
import { MilestonesPanel } from '@/features/milestones/MilestonesPanel';

/**
 * Roadmaps and OKRs, on one page behind a tab strip.
 *
 * They answer one question in two halves — what we're betting on, and what
 * "worked" would look like — and as two separate pages the sidebar was the only
 * way across, which made comparing a bet to its outcome a round trip. One page
 * makes the switch a tab.
 *
 * **The tab is the URL.** `/roadmaps` and `/okrs` both land here and each opens
 * its own tab, so every existing link, favourite and breadcrumb still resolves,
 * and a tab click is a real navigation you can bookmark and go Back from. The
 * alternative — one URL with the tab in component state — would have quietly
 * broken every `/okrs` link in the app.
 *
 * The shell owns only the tabs and the scroll column. Each tab's title and
 * primary action come from the panel itself via `PageHeader`, which portals into
 * the topbar — so adding a tab here never means teaching this file what that tab
 * can create.
 */
export function PlanningPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tab = pathname.startsWith('/okrs') ? '/okrs' : '/roadmaps';

  return (
    <FullScreenLayout>
      {/* The same sub-header strip the boards use, so a tabbed page reads the
          same wherever it appears in the app. */}
      <ViewTabs
        view={{
          value: tab,
          onChange: (next) => navigate(next),
          options: [
            {
              value: '/roadmaps',
              label: t('roadmaps.title'),
              icon: <Icon name="roadmap" size={16} />,
            },
            {
              value: '/okrs',
              label: t('milestones.title'),
              icon: <Icon name="milestone" size={16} />,
            },
          ],
        }}
      />

      {/* The centred column the two panels share — `CenteredPageLayout`'s shape,
          inlined because the tab strip above it has to run full-bleed to the
          page edges and so can't sit inside that column. */}
      <div className="min-w-0 flex-1 sm:overflow-y-auto">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
          {tab === '/okrs' ? <MilestonesPanel /> : <RoadmapsPanel />}
        </div>
      </div>
    </FullScreenLayout>
  );
}
