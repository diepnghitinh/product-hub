import { Loader2 } from 'lucide-react';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <Loader2
      className={cn('size-[18px] animate-spin text-muted-foreground', className)}
      role="status"
      aria-label={t('common.loading')}
    />
  );
}
