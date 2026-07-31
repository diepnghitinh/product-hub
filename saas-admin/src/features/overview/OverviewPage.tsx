import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  CircleSlash,
  CreditCard,
  TrendingUp,
  Users,
} from 'lucide-react';
import { CardsSkeleton, ErrorState } from '@/components/DataState';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/Button';
import { formatMoney, formatNumber } from '@/lib/format';
import { useOverview } from '@/lib/queries';

export function OverviewPage() {
  const { data, isPending, error, refetch } = useOverview();

  return (
    <>
      <PageHeader
        title="Overview"
        description="Every workspace on this deployment, at a glance."
        actions={
          <Button asChild variant="outline">
            <Link to="/tenants">All workspaces</Link>
          </Button>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <>
          <CardsSkeleton />
          <CardsSkeleton />
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Workspaces"
              value={formatNumber(data.tenantCount)}
              hint={`${formatNumber(data.activeTenantCount)} active`}
              icon={<Building2 className="size-4" />}
            />
            <StatCard
              label="People"
              value={formatNumber(data.userCount)}
              hint="Across all workspaces"
              icon={<Users className="size-4" />}
            />
            <StatCard
              label="MRR"
              value={formatMoney(data.mrr, data.currency)}
              hint="Active + trial subscriptions, normalised to a month"
              icon={<TrendingUp className="size-4" />}
              tone="success"
            />
            <StatCard
              label="On a plan"
              value={formatNumber(data.subscribedTenantCount)}
              hint={`${formatNumber(data.unassignedTenantCount)} with no plan yet`}
              icon={<CreditCard className="size-4" />}
              tone="info"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Trialling"
              value={formatNumber(data.trialTenantCount)}
              hint="Worth a nudge before the trial ends"
              tone="info"
            />
            <StatCard
              label="Past due"
              value={formatNumber(data.pastDueTenantCount)}
              hint="Payment has not landed"
              icon={<AlertTriangle className="size-4" />}
              tone="warning"
            />
            <StatCard
              label="Suspended"
              value={formatNumber(data.suspendedTenantCount)}
              hint="Data intact, nobody can sign in"
              icon={<CircleSlash className="size-4" />}
              tone="destructive"
            />
            <StatCard
              label="Over a limit"
              value={formatNumber(data.overLimitTenantCount)}
              hint="At or past a metered limit — not blocked"
              icon={<AlertTriangle className="size-4" />}
              tone={data.overLimitTenantCount > 0 ? 'warning' : 'default'}
            />
          </div>

          {/* V1 shows limits; it does not enforce them. Say so here rather than
              let an operator assume an over-limit workspace has been stopped. */}
          <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Limits are reported, not enforced — a workspace over its plan keeps working. Use{' '}
            <Link to="/usage" className="font-medium text-primary hover:underline">
              Usage
            </Link>{' '}
            to see who to talk to.
          </p>
        </>
      )}
    </>
  );
}
