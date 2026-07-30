import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { useEscapeBack } from '@/lib/useEscapeBack';
import { useIssueCrumbParent } from '@/features/issues/useIssueCrumb';
import { IssueKind } from '@/types/enums';
import { useBug } from './api';
import { BugDetail } from './components/BugDetail';
import { CenteredPageLayout } from '@/layouts/shared';

/** One bug's detail. Reached at `/issues/<ref>` — `IssueDetailPage` resolves the
 * kind and hands the ref down, so this isn't a route on its own. */
export function BugDetailPage({ issueRef: bugId }: { issueRef: string }) {
  const navigate = useNavigate();
  useEscapeBack();

  // Fetched only for the crumb (title + team); <BugDetail> re-reads the same
  // query (React Query dedupes it) for the body.
  const { data: bug } = useBug(bugId);
  const parent = useIssueCrumbParent(IssueKind.BUG, bug);

  return (
    <CenteredPageLayout>
      {/* Breadcrumb — `All issues › QC › BUG-…`, the same shape a task's page
          reads, resolved by the shared hook so the two can't drift. */}
      <PageHeader title={bug?.shortId || bug?.title || bugId || ''} parent={parent} />
      <BugDetail bugId={bugId} onDeleted={() => navigate('/issues?kind=bug')} menuTarget="topbar" />
    </CenteredPageLayout>
  );
}
