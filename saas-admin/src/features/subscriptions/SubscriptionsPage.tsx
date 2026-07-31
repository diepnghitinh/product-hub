import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Plus, Search, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/DataState';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { SubscriptionStatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
  SelectMenuValue,
} from '@/components/ui/select-menu';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import {
  useCancelSubscription,
  useRemoveSubscription,
  useSubscriptions,
  useTenants,
} from '@/lib/queries';
import type { Subscription, SubscriptionStatus } from '@/lib/types';
import { AssignPlanDialog } from './AssignPlanDialog';

const ALL = '__all__';

export function SubscriptionsPage() {
  const { data, isPending, error, refetch } = useSubscriptions();
  const cancel = useCancelSubscription();
  const remove = useRemoveSubscription();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(ALL);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [assigningTo, setAssigningTo] = useState<{ id: string; name: string } | null>(null);

  // Workspaces with no subscription row at all — the list this page exists to
  // shrink. Only the first page is fetched; on a big deployment the tenants
  // page is the place to work through them.
  const { data: tenantPage } = useTenants({ page: 1, limit: 100 });
  const unassigned = useMemo(
    () => (tenantPage?.data ?? []).filter((t) => !t.planCode),
    [tenantPage],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((s) => {
      if (status !== ALL && s.status !== status) return false;
      if (!q) return true;
      return (
        s.tenantName.toLowerCase().includes(q) ||
        (s.tenantSlug ?? '').toLowerCase().includes(q) ||
        (s.planName ?? s.planCode).toLowerCase().includes(q)
      );
    });
  }, [data, search, status]);

  const mrr = useMemo(
    () =>
      (data ?? [])
        .filter((s) => s.status === 'active' || s.status === 'trial')
        .reduce((sum, s) => sum + s.monthlyEquivalent, 0),
    [data],
  );
  const currency = data?.[0]?.currency ?? 'USD';

  async function onCancel(s: Subscription) {
    if (
      !window.confirm(
        `Cancel ${s.tenantName}'s subscription?\n\nThe row stays for the record and the workspace keeps working — cancelling here is bookkeeping, not a suspension.`,
      )
    ) {
      return;
    }
    try {
      await cancel.mutateAsync(s.tenantId);
      toast.success(`${s.tenantName} marked canceled`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not cancel');
    }
  }

  async function onRemove(s: Subscription) {
    if (
      !window.confirm(
        `Remove ${s.tenantName} from ${s.planName ?? s.planCode}?\n\nThe subscription record is deleted and every limit reads as zero until you assign a plan again.`,
      )
    ) {
      return;
    }
    try {
      await remove.mutateAsync(s.tenantId);
      toast.success(`${s.tenantName} has no plan`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the subscription');
    }
  }

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Which workspace is on which plan, and what they pay."
      />

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <TableSkeleton rows={6} cols={5} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Subscriptions" value={formatNumber(data.length)} />
            <StatCard
              label="MRR"
              value={formatMoney(mrr, currency)}
              hint="Active + trial"
              tone="success"
            />
            <StatCard
              label="Without a plan"
              value={formatNumber(unassigned.length)}
              hint={
                tenantPage && tenantPage.total > tenantPage.data.length
                  ? `Of the first ${formatNumber(tenantPage.data.length)} workspaces`
                  : 'Every limit reads zero for them'
              }
              tone={unassigned.length > 0 ? 'warning' : 'default'}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workspace or plan"
              icon={<Search />}
              className="sm:max-w-sm"
            />
            <SelectMenu value={status} onValueChange={setStatus}>
              <SelectMenuTrigger className="sm:w-40">
                <SelectMenuValue />
              </SelectMenuTrigger>
              <SelectMenuContent>
                <SelectMenuItem value={ALL}>All statuses</SelectMenuItem>
                <SelectMenuItem value="active">Active</SelectMenuItem>
                <SelectMenuItem value="trial">Trial</SelectMenuItem>
                <SelectMenuItem value="past_due">Past due</SelectMenuItem>
                <SelectMenuItem value="canceled">Canceled</SelectMenuItem>
              </SelectMenuContent>
            </SelectMenu>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={<CreditCard className="size-6" />}
              title={data.length === 0 ? 'Nobody is on a plan yet' : 'No subscriptions match'}
              description={
                data.length === 0
                  ? 'Assign a plan from a workspace, or from the list below.'
                  : 'Try a different search or clear the status filter.'
              }
            />
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-lg border md:block">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Workspace</th>
                      <th className="px-4 py-2.5 text-left font-medium">Plan</th>
                      <th className="px-4 py-2.5 text-left font-medium">Status</th>
                      <th className="px-4 py-2.5 text-left font-medium">Cycle</th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium">
                        Per month
                      </th>
                      <th className="px-4 py-2.5 text-left font-medium">Renews</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((s) => (
                      <tr key={s.id} className="transition-colors hover:bg-muted/50">
                        {/* See TenantsPage: w-full + max-w-0 hands the leftover width
                            to the name column instead of collapsing it. */}
                        <td className="w-full max-w-0 px-4 py-3">
                          <Link
                            to={`/tenants/${s.tenantId}`}
                            className="block truncate font-medium hover:underline"
                          >
                            {s.tenantName}
                          </Link>
                          {s.tenantStatus === 'suspended' && (
                            <span className="text-xs text-destructive">Suspended</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {s.planName ?? (
                            /* The plan behind this row is gone — the API can't
                               name it, and the number below is a guess. */
                            <span className="text-destructive">{s.planCode} (missing)</span>
                          )}
                          {Object.keys(s.featureOverrides).length > 0 && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              +{Object.keys(s.featureOverrides).length} override
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <SubscriptionStatusBadge status={s.status} />
                        </td>
                        <td className="px-4 py-3 capitalize text-muted-foreground">
                          {s.billingCycle}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatMoney(s.monthlyEquivalent, s.currency)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {formatDate(s.currentPeriodEnd)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button variant="outline" size="sm" onClick={() => setEditing(s)}>
                              Change
                            </Button>
                            {s.status !== 'canceled' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                onClick={() => onCancel(s)}
                                aria-label={`Cancel ${s.tenantName}`}
                                title="Mark canceled"
                              >
                                <XCircle />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              onClick={() => onRemove(s)}
                              aria-label={`Remove ${s.tenantName} from its plan`}
                              title="Remove the subscription"
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 md:hidden">
                {rows.map((s) => (
                  <div key={s.id} className="rounded-lg border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          to={`/tenants/${s.tenantId}`}
                          className="block truncate font-medium hover:underline"
                        >
                          {s.tenantName}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.planName ?? `${s.planCode} (missing)`} · {s.billingCycle}
                        </p>
                      </div>
                      <SubscriptionStatusBadge status={s.status} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-sm tabular-nums">
                        {formatMoney(s.monthlyEquivalent, s.currency)}
                        <span className="text-muted-foreground"> / month</span>
                      </span>
                      <Button variant="outline" size="sm" onClick={() => setEditing(s)}>
                        Change
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {unassigned.length > 0 && (
            <section className="rounded-lg border bg-card">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Workspaces without a plan</h2>
                <p className="text-xs text-muted-foreground">
                  They work normally, but every metered limit reads as zero.
                </p>
              </div>
              <ul className="divide-y">
                {unassigned.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <Link
                      to={`/tenants/${t.id}`}
                      className="min-w-0 flex-1 truncate text-sm hover:underline"
                    >
                      {t.name}
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAssigningTo({ id: t.id, name: t.name })}
                    >
                      <Plus />
                      Assign
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {editing && (
        <AssignPlanDialog
          open
          onClose={() => setEditing(null)}
          tenantId={editing.tenantId}
          tenantName={editing.tenantName}
          current={editing}
        />
      )}
      {assigningTo && (
        <AssignPlanDialog
          open
          onClose={() => setAssigningTo(null)}
          tenantId={assigningTo.id}
          tenantName={assigningTo.name}
        />
      )}
    </>
  );
}
