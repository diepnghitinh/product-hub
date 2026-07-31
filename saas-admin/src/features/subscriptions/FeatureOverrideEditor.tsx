import { ChevronDown, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/switch';
import { formatLimit } from '@/lib/format';
import { useFeatureCatalog, usePlans } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { FeatureMap } from '@/lib/types';

/**
 * Per-tenant deviations layered on top of the plan.
 *
 * An override is *presence*, not value: a key that isn't here inherits from the
 * plan chain, and there is no such thing as an override that happens to equal
 * the plan. That's why every row has a reset — it's the only way to go back to
 * inheriting once you've typed a number.
 */
export function FeatureOverrideEditor({
  planCode,
  value,
  onChange,
}: {
  planCode: string;
  value: FeatureMap;
  onChange: (next: FeatureMap) => void;
}) {
  const { data: catalog } = useFeatureCatalog();
  const { data: plans } = usePlans();
  const [open, setOpen] = useState(() => Object.keys(value).length > 0);

  const plan = plans?.find((p) => p.code === planCode);
  const count = Object.keys(value).length;

  function set(key: string, grant: { enabled?: boolean; limit?: number }) {
    onChange({ ...value, [key]: grant });
  }

  function clear(key: string) {
    const next = { ...value };
    delete next[key];
    onChange(next);
  }

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <p className="text-sm font-medium">Plan overrides</p>
          <p className="text-xs text-muted-foreground">
            {count === 0
              ? 'This workspace gets exactly what the plan grants.'
              : `${count} feature${count === 1 ? '' : 's'} differ from the plan.`}
          </p>
        </div>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="max-h-72 space-y-1 overflow-y-auto border-t p-2">
          {(catalog ?? []).map((f) => {
            const inherited = plan?.effectiveFeatures?.[f.key];
            const override = value[f.key];
            const overridden = override !== undefined;

            return (
              <div
                key={f.key}
                className={cn(
                  'flex items-center gap-3 rounded-md px-2 py-1.5',
                  overridden && 'bg-primary/5',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{f.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Plan:{' '}
                    {f.type === 'flag'
                      ? inherited?.enabled
                        ? 'On'
                        : 'Off'
                      : formatLimit(inherited?.limit ?? 0)}
                  </p>
                </div>

                {f.type === 'flag' ? (
                  <Switch
                    checked={overridden ? !!override.enabled : !!inherited?.enabled}
                    onCheckedChange={(checked) => set(f.key, { enabled: checked })}
                    aria-label={f.name}
                  />
                ) : (
                  <Input
                    type="number"
                    className="h-8 w-24 text-right"
                    value={overridden ? String(override.limit ?? 0) : ''}
                    placeholder={String(inherited?.limit ?? 0)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') return clear(f.key);
                      set(f.key, { limit: Number(raw) });
                    }}
                    aria-label={f.name}
                  />
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn('size-8 shrink-0', !overridden && 'invisible')}
                  onClick={() => clear(f.key)}
                  aria-label={`Reset ${f.name} to the plan`}
                  title="Back to the plan's value"
                >
                  <RotateCcw />
                </Button>
              </div>
            );
          })}
          <p className="px-2 pb-1 pt-2 text-xs text-muted-foreground">
            Use <span className="font-mono">-1</span> for unlimited. Clear a number to go back
            to inheriting.
          </p>
        </div>
      )}
    </div>
  );
}
