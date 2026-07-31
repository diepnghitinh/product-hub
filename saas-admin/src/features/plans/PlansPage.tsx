import { useState } from 'react';
import { Check, Minus, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CardsSkeleton, EmptyState, ErrorState } from '@/components/DataState';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/Button';
import { formatLimit, formatMoney, formatNumber } from '@/lib/format';
import { useDeletePlan, useFeatureCatalog, usePlans } from '@/lib/queries';
import type { Plan } from '@/lib/types';
import { PlanEditorDialog } from './PlanEditorDialog';

export function PlansPage() {
  const { data: plans, isPending, error, refetch } = usePlans();
  const { data: catalog } = useFeatureCatalog();
  const remove = useDeletePlan();
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);

  async function onDelete(plan: Plan) {
    if (
      !window.confirm(
        `Delete the ${plan.name} plan?\n\nThis only works if nobody is on it and no other plan builds on it.`,
      )
    ) {
      return;
    }
    try {
      await remove.mutateAsync(plan.id);
      toast.success(`${plan.name} deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the plan');
    }
  }

  const limits = (catalog ?? []).filter((f) => f.type === 'metered');
  const capabilities = (catalog ?? []).filter((f) => f.type === 'flag');

  return (
    <>
      <PageHeader
        title="Plans"
        description="What each tier grants. A plan states only what it changes about its base — the rest is inherited live."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            New plan
          </Button>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <CardsSkeleton count={3} />
      ) : plans.length === 0 ? (
        <EmptyState
          icon={<Package className="size-6" />}
          title="No plans yet"
          description="Create a plan, or run `npm run seed:platform` in the backend for a Free / Pro / Business starter catalog."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus />
              New plan
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <div key={plan.id} className="flex flex-col rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold">{plan.name}</h2>
                      {!plan.isActive && <Badge variant="muted">Inactive</Badge>}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{plan.code}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setEditing(plan)}
                      aria-label={`Edit ${plan.name}`}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(plan)}
                      aria-label={`Delete ${plan.name}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                <p className="mt-3 text-2xl font-semibold tracking-tight">
                  {formatMoney(plan.priceMonthly, plan.currency)}
                  <span className="text-sm font-normal text-muted-foreground"> / month</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(plan.priceYearly, plan.currency)} billed yearly
                </p>

                {plan.description && (
                  <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="secondary">
                    {formatNumber(plan.subscriberCount)} subscriber
                    {plan.subscriberCount === 1 ? '' : 's'}
                  </Badge>
                  {plan.extendsCode && (
                    <Badge variant="outline">builds on {plan.extendsCode}</Badge>
                  )}
                </div>

                <dl className="mt-4 space-y-1 border-t pt-3 text-sm">
                  {limits.map((f) => (
                    <div key={f.key} className="flex justify-between gap-3">
                      <dt className="truncate text-muted-foreground">{f.name}</dt>
                      <dd className="shrink-0 tabular-nums">
                        {formatLimit(plan.effectiveFeatures[f.key]?.limit ?? 0)}
                      </dd>
                    </div>
                  ))}
                </dl>

                <ul className="mt-3 space-y-1 border-t pt-3 text-sm">
                  {capabilities.map((f) => {
                    const on = !!plan.effectiveFeatures[f.key]?.enabled;
                    return (
                      <li key={f.key} className="flex items-center gap-2">
                        {on ? (
                          <Check className="size-3.5 shrink-0 text-success" />
                        ) : (
                          <Minus className="size-3.5 shrink-0 text-muted-foreground/50" />
                        )}
                        <span className={on ? 'truncate' : 'truncate text-muted-foreground/60'}>
                          {f.name}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Cards show the <strong>effective</strong> entitlements — a plan's own grants merged
            over everything it inherits. Open one to see which values it actually states.
          </p>
        </>
      )}

      <PlanEditorDialog open={creating} onClose={() => setCreating(false)} />
      <PlanEditorDialog open={!!editing} onClose={() => setEditing(null)} plan={editing} />
    </>
  );
}
