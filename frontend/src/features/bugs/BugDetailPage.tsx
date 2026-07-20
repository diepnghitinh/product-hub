import { useNavigate, useParams } from 'react-router-dom';
import { t } from '@/i18n';
import { Icon } from '@/components/Icon';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { useEscapeBack } from '@/lib/useEscapeBack';
import { BugDetail } from './components/BugDetail';
import { CenteredPageLayout } from '@/layouts/shared';

export function BugDetailPage() {
  const { bugId } = useParams<{ bugId: string }>();
  const navigate = useNavigate();
  useEscapeBack();

  return (
    <CenteredPageLayout>
      {/* The topbar breadcrumb replaces the old back link. Bugs aren't in the
          nav model, so the parent is named here. */}
      <PageHeader
        title={bugId ?? ''}
        parent={{ to: '/bugs', label: t('bugs.title') }}
        leading={<Icon name="bug" size={16} className="shrink-0 text-muted-foreground" />}
      />
      <BugDetail bugId={bugId} onDeleted={() => navigate('/bugs')} />
    </CenteredPageLayout>
  );
}
