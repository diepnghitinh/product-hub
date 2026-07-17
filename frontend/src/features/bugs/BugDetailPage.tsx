import { useNavigate, useParams } from 'react-router-dom';
import { t } from '@/i18n';
import { BackLink } from '@/components/BackLink';
import { useEscapeBack } from '@/lib/useEscapeBack';
import { BugDetail } from './components/BugDetail';

export function BugDetailPage() {
  const { bugId } = useParams<{ bugId: string }>();
  const navigate = useNavigate();
  useEscapeBack();

  return (
    <div>
      <BackLink to="/bugs">{t('bugs.backToBoard')}</BackLink>
      <BugDetail bugId={bugId} onDeleted={() => navigate('/bugs')} />
    </div>
  );
}
