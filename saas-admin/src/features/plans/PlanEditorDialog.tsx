import { useEffect, useState, type FormEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/Textarea';
import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
  SelectMenuValue,
} from '@/components/ui/select-menu';
import { formatLimit } from '@/lib/format';
import { useCreatePlan, useFeatureCatalog, usePlans, useUpdatePlan } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { FeatureMap, Plan } from '@/lib/types';

const NO_BASE = '__none__';

/**
 * Create or edit a plan.
 *
 * A plan is **sparse**: it states only what it changes about its base, and
 * everything else is inherited live — edit Free's member limit and every plan
 * that doesn't override it moves too. That's why each row shows the inherited
 * value as a placeholder and has a reset: leaving a field blank is a decision.
 */
export function PlanEditorDialog({
  open,
  onClose,
  plan,
}: {
  open: boolean;
  onClose: () => void;
  /** Absent = creating. */
  plan?: Plan | null;
}) {
  const { data: plans } = usePlans();
  const { data: catalog } = useFeatureCatalog();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const editing = !!plan;

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceMonthly, setPriceMonthly] = useState('0');
  const [priceYearly, setPriceYearly] = useState('0');
  const [currency, setCurrency] = useState('USD');
  const [extendsCode, setExtendsCode] = useState(NO_BASE);
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [features, setFeatures] = useState<FeatureMap>({});

  useEffect(() => {
    if (!open) return;
    setCode(plan?.code ?? '');
    setName(plan?.name ?? '');
    setDescription(plan?.description ?? '');
    setPriceMonthly(String(plan?.priceMonthly ?? 0));
    setPriceYearly(String(plan?.priceYearly ?? 0));
    setCurrency(plan?.currency ?? 'USD');
    setExtendsCode(plan?.extendsCode ?? NO_BASE);
    setSortOrder(String(plan?.sortOrder ?? plans?.length ?? 0));
    setIsActive(plan?.isActive ?? true);
    setFeatures(plan?.features ?? {});
  }, [open, plan, plans]);

  // What this plan would inherit if it stated nothing — the base's *effective*
  // set, which already includes the base's own base.
  const base = plans?.find((p) => p.code === extendsCode);
  const inherited = base?.effectiveFeatures ?? {};

  function setGrant(key: string, grant: { enabled?: boolean; limit?: number }) {
    setFeatures((f) => ({ ...f, [key]: grant }));
  }

  function clearGrant(key: string) {
    setFeatures((f) => {
      const next = { ...f };
      delete next[key];
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      priceMonthly: Number(priceMonthly) || 0,
      priceYearly: Number(priceYearly) || 0,
      currency: currency.trim().toUpperCase() || 'USD',
      extendsCode: extendsCode === NO_BASE ? null : extendsCode,
      sortOrder: Number(sortOrder) || 0,
      isActive,
      features,
    };
    try {
      if (editing) {
        await updatePlan.mutateAsync({ id: plan.id, ...payload });
        toast.success(`${payload.name} saved`);
      } else {
        await createPlan.mutateAsync({ code: code.trim(), ...payload });
        toast.success(`${payload.name} created`);
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the plan');
    }
  }

  const busy = createPlan.isPending || updatePlan.isPending;
  const limits = (catalog ?? []).filter((f) => f.type === 'metered');
  const capabilities = (catalog ?? []).filter((f) => f.type === 'flag');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${plan.name}` : 'New plan'}
      className="max-w-2xl"
      fullscreenKey="plan-editor"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="plan-editor" loading={busy}>
            {editing ? 'Save plan' : 'Create plan'}
          </Button>
        </>
      }
    >
      <form id="plan-editor" onSubmit={onSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Name</Label>
            <Input
              id="p-name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pro"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-code">Code</Label>
            <Input
              id="p-code"
              required
              disabled={editing}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="pro"
            />
            <p className="text-xs text-muted-foreground">
              {editing
                ? 'Subscriptions point at this — it cannot change.'
                : 'Lowercase letters, numbers and dashes. Permanent.'}
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-desc">Description</Label>
            <Input
              id="p-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="For growing product teams"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-monthly">Price / month</Label>
            <Input
              id="p-monthly"
              type="number"
              min={0}
              step="0.01"
              value={priceMonthly}
              onChange={(e) => setPriceMonthly(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-yearly">Price / year</Label>
            <Input
              id="p-yearly"
              type="number"
              min={0}
              step="0.01"
              value={priceYearly}
              onChange={(e) => setPriceYearly(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-currency">Currency</Label>
            <Input
              id="p-currency"
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              MRR assumes one currency across the catalog.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-order">Sort order</Label>
            <Input
              id="p-order"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-base">Builds on</Label>
            <SelectMenu value={extendsCode} onValueChange={setExtendsCode}>
              <SelectMenuTrigger id="p-base">
                <SelectMenuValue />
              </SelectMenuTrigger>
              <SelectMenuContent>
                <SelectMenuItem value={NO_BASE}>Nothing — states everything</SelectMenuItem>
                {(plans ?? [])
                  .filter((p) => p.code !== plan?.code)
                  .map((p) => (
                    <SelectMenuItem key={p.code} value={p.code}>
                      {p.name}
                    </SelectMenuItem>
                  ))}
              </SelectMenuContent>
            </SelectMenu>
            <p className="text-xs text-muted-foreground">
              Inheritance is live: change the base later and this plan follows.
            </p>
          </div>
          <label className="flex items-center gap-3 sm:col-span-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <span className="text-sm">
              Available for new subscriptions
              <span className="block text-xs text-muted-foreground">
                Turning this off leaves existing subscribers exactly where they are.
              </span>
            </span>
          </label>
        </div>

        <FeatureGroup
          title="Limits"
          hint="Blank inherits. Use -1 for unlimited, 0 to switch it off."
          rows={limits.map((f) => {
            const own = features[f.key];
            const set = own !== undefined;
            return (
              <FeatureRow
                key={f.key}
                name={f.name}
                inheritedLabel={formatLimit(inherited[f.key]?.limit ?? 0)}
                overridden={set}
                onReset={() => clearGrant(f.key)}
                control={
                  <Input
                    type="number"
                    className="h-8 w-24 text-right"
                    value={set ? String(own.limit ?? 0) : ''}
                    placeholder={String(inherited[f.key]?.limit ?? 0)}
                    onChange={(e) =>
                      e.target.value === ''
                        ? clearGrant(f.key)
                        : setGrant(f.key, { limit: Number(e.target.value) })
                    }
                    aria-label={f.name}
                  />
                }
              />
            );
          })}
        />

        <FeatureGroup
          title="Capabilities"
          hint="A switch you haven't touched inherits from the base plan."
          rows={capabilities.map((f) => {
            const own = features[f.key];
            const set = own !== undefined;
            return (
              <FeatureRow
                key={f.key}
                name={f.name}
                inheritedLabel={inherited[f.key]?.enabled ? 'On' : 'Off'}
                overridden={set}
                onReset={() => clearGrant(f.key)}
                control={
                  <Switch
                    checked={set ? !!own.enabled : !!inherited[f.key]?.enabled}
                    onCheckedChange={(checked) => setGrant(f.key, { enabled: checked })}
                    aria-label={f.name}
                  />
                }
              />
            );
          })}
        />
      </form>
    </Dialog>
  );
}

function FeatureGroup({
  title,
  hint,
  rows,
}: {
  title: string;
  hint: string;
  rows: React.ReactNode[];
}) {
  return (
    <div className="rounded-lg border">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="space-y-1 p-2">{rows}</div>
    </div>
  );
}

function FeatureRow({
  name,
  inheritedLabel,
  overridden,
  onReset,
  control,
}: {
  name: string;
  inheritedLabel: string;
  overridden: boolean;
  onReset: () => void;
  control: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md px-2 py-1.5',
        overridden && 'bg-primary/5',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{name}</p>
        <p className="truncate text-xs text-muted-foreground">Inherits: {inheritedLabel}</p>
      </div>
      {control}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn('size-8 shrink-0', !overridden && 'invisible')}
        onClick={onReset}
        aria-label={`Reset ${name}`}
        title="Back to inheriting"
      >
        <RotateCcw />
      </Button>
    </div>
  );
}
