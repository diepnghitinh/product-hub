import { useNavigate } from 'react-router-dom';
import { t } from '@/i18n';
import { Icon } from '@/components/Icon';
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
      <PageHeader
        title={bugId ?? ''}
        parent={{ to: '/bugs', label: t('bugs.title') }}
        leading={<span className="flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent/60 hover:text-accent-foreground"><Icon name="bug" size={16} className="shrink-0" /></span>}
      />
      <BugDetail bugId={bugId} onDeleted={() => navigate('/bugs')} menuTarget="topbar" />
    </CenteredPageLayout>
  );
}
