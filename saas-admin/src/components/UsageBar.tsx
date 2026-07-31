import { formatLimit, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TenantUsageLine } from '@/lib/types';

/**
 * One metered feature: what a tenant is allowed and what they've used.
 *
 * V1 is display-only — the API does not reject a request for being over limit,
 * so "over" here means *tell someone*, not *blocked*. Unlimited draws no bar at
 * all rather than a full or empty one, both of which would be a lie.
 */
export function UsageBar({ line }: { line: TenantUsageLine }) {
  const unlimited = line.limit < 0;
  const off = !unlimited && line.limit === 0;
  const pct = line.percent ?? 0;
  const near = !unlimited && !off && pct >= 80;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate font-medium">{line.name}</span>
        <span
          className={cn(
            'shrink-0 tabular-nums',
            line.overLimit
              ? 'font-medium text-destructive'
              : near
                ? 'font-medium text-warning'
                : 'text-muted-foreground',
          )}
        >
          {formatNumber(line.used)}
          <span className="text-muted-foreground"> / {formatLimit(line.limit)}</span>
        </span>
      </div>
      {unlimited ? (
        <div className="mt-1.5 h-1.5 rounded-full bg-muted" />
      ) : (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-[width]',
              line.overLimit ? 'bg-destructive' : near ? 'bg-warning' : 'bg-primary',
            )}
            style={{ width: `${Math.min(100, Math.max(pct, line.used > 0 ? 2 : 0))}%` }}
          />
        </div>
      )}
    </div>
  );
}
