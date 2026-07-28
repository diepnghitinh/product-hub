import { useNavigate } from 'react-router-dom';
import { t } from '@/i18n';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { useEscapeBack } from '@/lib/useEscapeBack';
import { BugDetail } from './components/BugDetail';
import { CenteredPageLayout } from '@/layouts/shared';

/** One bug's detail. Reached at `/issues/<ref>` — `IssueDetailPage` resolves the
 * kind and hands the ref down, so this isn't a route on its own. */
export function BugDetailPage({ issueRef: bugId }: { issueRef: string }) {
  const navigate = useNavigate();
  useEscapeBack();

  return (
    <CenteredPageLayout>
      {/* The topbar breadcrumb replaces the old back link. Bugs aren't in the
          nav model, so the parent is named here. */}
      <PageHeader title={bugId ?? ''} parent={{ to: '/bugs', label: t('bugs.title') }} />
      <BugDetail bugId={bugId} onDeleted={() => navigate('/bugs')} menuTarget="topbar" />
    </CenteredPageLayout>
  );
}
