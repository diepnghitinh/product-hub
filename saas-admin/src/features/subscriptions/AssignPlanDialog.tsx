import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
  SelectMenuValue,
} from '@/components/ui/select-menu';
import { formatMoney } from '@/lib/format';
import { usePlans, useUpsertSubscription } from '@/lib/queries';
import type { BillingCycle, FeatureMap, Subscription, SubscriptionStatus } from '@/lib/types';
import { FeatureOverrideEditor } from './FeatureOverrideEditor';

/** `YYYY-MM-DD` for `<input type="date">`; the API wants a full ISO string. */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: 'Trial',
  active: 'Active',
  past_due: 'Past due',
  canceled: 'Canceled',
};

/**
 * Assign or change a workspace's plan. This is an upsert on the API — a tenant
 * has exactly one subscription, so "put them on Pro" is the same call whether or
 * not they were already on something.
 */
export function AssignPlanDialog({
  open,
  onClose,
  tenantId,
  tenantName,
  current,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  tenantName: string;
  current?: Subscription | null;
}) {
  const { data: plans } = usePlans();
  const upsert = useUpsertSubscription();

  const [planCode, setPlanCode] = useState('');
  const [status, setStatus] = useState<SubscriptionStatus>('active');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [periodEnd, setPeriodEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [overrides, setOverrides] = useState<FeatureMap>({});

  // Reset from the current subscription each time the dialog opens, so a
  // cancelled edit never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setPlanCode(current?.planCode ?? plans?.find((p) => p.isActive)?.code ?? '');
    setStatus(current?.status ?? 'active');
    setBillingCycle(current?.billingCycle ?? 'monthly');
    setPeriodEnd(toDateInput(current?.currentPeriodEnd));
    setNotes(current?.notes ?? '');
    setOverrides(current?.featureOverrides ?? {});
  }, [open, current, plans]);

  const plan = plans?.find((p) => p.code === planCode);
  const price = plan
    ? billingCycle === 'yearly'
      ? formatMoney(plan.priceYearly, plan.currency) + ' / year'
      : formatMoney(plan.priceMonthly, plan.currency) + ' / month'
    : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!planCode) return;
    try {
      await upsert.mutateAsync({
        tenantId,
        planCode,
        status,
        billingCycle,
        // An empty date field means "no period end", which the API stores as null.
        currentPeriodEnd: periodEnd ? new Date(periodEnd).toISOString() : null,
        featureOverrides: overrides,
        notes: notes.trim() || null,
      });
      toast.success(`${tenantName} is on ${plan?.name ?? planCode}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the subscription');
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={current ? `Change plan · ${tenantName}` : `Assign a plan · ${tenantName}`}
      className="max-w-xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="assign-plan" loading={upsert.isPending} disabled={!planCode}>
            Save
          </Button>
        </>
      }
    >
      <form id="assign-plan" onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="s-plan">Plan</Label>
            <SelectMenu value={planCode} onValueChange={setPlanCode}>
              <SelectMenuTrigger id="s-plan">
                <SelectMenuValue placeholder="Pick a plan" />
              </SelectMenuTrigger>
              <SelectMenuContent>
                {(plans ?? []).map((p) => (
                  <SelectMenuItem key={p.code} value={p.code}>
                    {p.name}
                    {!p.isActive && ' (inactive)'}
                  </SelectMenuItem>
                ))}
              </SelectMenuContent>
            </SelectMenu>
            {price && <p className="text-xs text-muted-foreground">{price}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="s-status">Status</Label>
            <SelectMenu
              value={status}
              onValueChange={(v) => setStatus(v as SubscriptionStatus)}
            >
              <SelectMenuTrigger id="s-status">
                <SelectMenuValue />
              </SelectMenuTrigger>
              <SelectMenuContent>
                {(Object.keys(STATUS_LABEL) as SubscriptionStatus[]).map((s) => (
                  <SelectMenuItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectMenuItem>
                ))}
              </SelectMenuContent>
            </SelectMenu>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="s-cycle">Billing cycle</Label>
            <SelectMenu
              value={billingCycle}
              onValueChange={(v) => setBillingCycle(v as BillingCycle)}
            >
              <SelectMenuTrigger id="s-cycle">
                <SelectMenuValue />
              </SelectMenuTrigger>
              <SelectMenuContent>
                <SelectMenuItem value="monthly">Monthly</SelectMenuItem>
                <SelectMenuItem value="yearly">Yearly</SelectMenuItem>
              </SelectMenuContent>
            </SelectMenu>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="s-period">Current period ends</Label>
            <Input
              id="s-period"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Bookkeeping only — nothing expires on its own.
            </p>
          </div>
        </div>

        <FeatureOverrideEditor
          planCode={planCode}
          value={overrides}
          onChange={setOverrides}
        />

        <div className="space-y-1.5">
          <Label htmlFor="s-notes">Internal notes</Label>
          <Textarea
            id="s-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why this deal looks the way it does."
          />
        </div>
      </form>
    </Dialog>
  );
}
