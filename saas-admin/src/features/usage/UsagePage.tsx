import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gauge } from 'lucide-react';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/DataState';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Badge } from '@/components/ui/badge';
import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
  SelectMenuValue,
} from '@/components/ui/select-menu';
import { effectiveFeatures, USAGE_RESOURCES, usageFor } from '@/lib/entitlements';
import { formatLimit, formatNumber } from '@/lib/format';
import { usePlans, useSubscriptions, useTenants } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** One screen, not a paginated crawl — but not the whole DB either. */
const SCAN_LIMIT = 200;

export function UsagePage() {
  const { data: page, isPending, error, refetch } = useTenants({ page: 1, limit: SCAN_LIMIT });
  const { data: plans } = usePlans();
  const { data: subscriptions } = useSubscriptions();
  const [resourceKey, setResourceKey] = useState<string>('users');

  const resource = USAGE_RESOURCES.find((r) => r.key === resourceKey) ?? USAGE_RESOURCES[0];

  const rows = useMemo(() => {
    if (!page) return [];
    const planByCode = new Map((plans ?? []).map((p) => [p.code, p]));
    const subByTenant = new Map((subscriptions ?? []).map((s) => [s.tenantId, s]));

    return page.data
      .map((tenant) => {
        const features = effectiveFeatures(
          tenant.planCode ? planByCode.get(tenant.planCode) : undefined,
          subByTenant.get(tenant.id),
        );
        return { tenant, ...usageFor(tenant, features, resource) };
      })
      .sort((a, b) => {
        // Over-limit first, then by how close to the ceiling, then by raw usage
        // so unlimited workspaces still rank against each other.
        if (a.overLimit !== b.overLimit) return a.overLimit ? -1 : 1;
        const ap = a.percent ?? -1;
        const bp = b.percent ?? -1;
        if (ap !== bp) return bp - ap;
        return b.used - a.used;
      });
  }, [page, plans, subscriptions, resource]);

  const overCount = rows.filter((r) => r.overLimit).length;
  const nearCount = rows.filter(
    (r) => !r.overLimit && r.percent !== null && r.percent >= 80,
  ).length;
  const total = rows.reduce((sum, r) => sum + r.used, 0);

  return (
    <>
      <PageHeader
        title="Usage"
        description="What each workspace actually uses against what its plan allows."
        actions={
          <SelectMenu value={resourceKey} onValueChange={setResourceKey}>
            <SelectMenuTrigger className="w-48">
              <SelectMenuValue />
            </SelectMenuTrigger>
            <SelectMenuContent>
              {USAGE_RESOURCES.map((r) => (
                <SelectMenuItem key={r.key} value={r.key}>
                  {r.label}
                </SelectMenuItem>
              ))}
            </SelectMenuContent>
          </SelectMenu>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <TableSkeleton rows={8} cols={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Gauge className="size-6" />}
          title="No workspaces to measure"
          description="Create a workspace and its usage shows up here."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label={`Total ${resource.label.toLowerCase()}`}
              value={formatNumber(total)}
              hint={`Across ${formatNumber(rows.length)} workspaces`}
            />
            <StatCard
              label="Over limit"
              value={formatNumber(overCount)}
              hint="Reported, not blocked"
              tone={overCount > 0 ? 'destructive' : 'default'}
            />
            <StatCard
              label="Past 80%"
              value={formatNumber(nearCount)}
              hint="Worth an upgrade conversation"
              tone={nearCount > 0 ? 'warning' : 'default'}
            />
          </div>

          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Workspace</th>
                  <th className="hidden px-4 py-2.5 text-left font-medium sm:table-cell">Plan</th>
                  <th className="px-4 py-2.5 text-right font-medium">{resource.label}</th>
                  <th className="w-40 whitespace-nowrap px-4 py-2.5 text-left font-medium">
                    Of limit
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(({ tenant, used, limit, percent, overLimit }) => {
                  const near = !overLimit && percent !== null && percent >= 80;
                  return (
                    <tr key={tenant.id} className="transition-colors hover:bg-muted/50">
                      {/* See TenantsPage: w-full + max-w-0 hands the leftover width
                          to the name column instead of collapsing it. */}
                      <td className="w-full max-w-0 px-4 py-3">
                        <Link
                          to={`/tenants/${tenant.id}`}
                          className="block truncate font-medium hover:underline"
                        >
                          {tenant.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground sm:hidden">
                          {tenant.planName ?? 'No plan'}
                        </p>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        {tenant.planName ? (
                          <span className="text-muted-foreground">{tenant.planName}</span>
                        ) : (
                          <Badge variant="outline">No plan</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        <span
                          className={cn(
                            overLimit
                              ? 'font-medium text-destructive'
                              : near
                                ? 'font-medium text-warning'
                                : '',
                          )}
                        >
                          {formatNumber(used)}
                        </span>
                        <span className="text-muted-foreground"> / {formatLimit(limit)}</span>
                      </td>
                      {/* min-w is what stops the w-full name column from squeezing
                          the bar out of existence — a table cell's min-width is a
                          floor the greedy column has to yield to. */}
                      <td className="min-w-[9.5rem] px-4 py-3">
                        {percent === null ? (
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {limit < 0 ? 'Unlimited' : 'Not granted'}
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  overLimit ? 'bg-destructive' : near ? 'bg-warning' : 'bg-primary',
                                )}
                                style={{ width: `${Math.min(100, percent)}%` }}
                              />
                            </div>
                            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                              {percent}%
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Limits come from the plan plus any per-workspace overrides. Nothing here blocks a
            request — being over a limit is a conversation, not a wall.
            {page.total > rows.length && (
              <>
                {' '}
                Showing the first {formatNumber(rows.length)} of {formatNumber(page.total)}{' '}
                workspaces.
              </>
            )}
          </p>
        </>
      )}
    </>
  );
}
