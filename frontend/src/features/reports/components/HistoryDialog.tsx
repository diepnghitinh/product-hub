import { Dialog, Spinner } from '@/components/ui';
import { t } from '@/i18n';
import { timeAgo } from '@/lib/format';
import { useAuditLog } from '@/features/audit-log/api';

interface HistoryDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

export function HistoryDialog({ open, onClose, projectId }: HistoryDialogProps) {
  const { data, isLoading } = useAuditLog(projectId, open);
  const entries = data?.items ?? [];

  return (
    <Dialog open={open} onClose={onClose} title={t('history.title')}>
      {isLoading ? (
        <div className="grid place-items-center py-8">
          <Spinner />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('history.empty')}</p>
      ) : (
        <ul className="flex max-h-[420px] flex-col gap-3 overflow-y-auto">
          {entries.map((e) => (
            <li key={e.id} className="border-b pb-3 last:border-0 last:pb-0">
              <div className="flex flex-wrap justify-between gap-3">
                <span className="font-medium">{e.entityRef}</span>
                <span className="text-sm">
                  <span className="text-muted-foreground line-through">{e.oldValue || '—'}</span> →{' '}
                  <span className="font-medium text-foreground">{e.newValue}</span>
                </span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {t('history.by')} {e.actorName || e.actorType} · {timeAgo(e.createdAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
