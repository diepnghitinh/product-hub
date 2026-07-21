import { useMemo } from 'react';
import { ArrowDown, ArrowUp, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui';
import { cn } from '@/lib/utils';
import { daysBetween } from '@/lib/format';
import { t } from '@/i18n';
import type { RoadmapItem } from '@/types/dto';

/** Calendar month as a single comparable number, so "last month" is just `-1`. */
const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth();
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

interface Timing {
  completedCount: number;
  /** Averages across every completed item (whole days), or null when none. */
  avgLead: number | null;
  avgCycle: number | null;
  /** Month-over-month change in days (this calendar month − last), or null when
   *  either month has no completed items to compare. Negative = faster = better. */
  leadMoM: number | null;
  cycleMoM: number | null;
}

/** Lead time = requested→completed; cycle time = started→completed. Both are
 *  measured only on completed items; MoM buckets them by completion month. */
function computeTiming(items: RoadmapItem[]): Timing {
  const thisMonth = monthKey(new Date());
  const leadAll: number[] = [];
  const cycleAll: number[] = [];
  const leadThis: number[] = [];
  const leadLast: number[] = [];
  const cycleThis: number[] = [];
  const cycleLast: number[] = [];
  let completedCount = 0;

  for (const i of items) {
    if (!i.completedAt) continue;
    completedCount++;
    const m = monthKey(new Date(i.completedAt));
    if (i.createdAt) {
      const lead = daysBetween(i.createdAt, i.completedAt);
      leadAll.push(lead);
      if (m === thisMonth) leadThis.push(lead);
      else if (m === thisMonth - 1) leadLast.push(lead);
    }
    if (i.startedAt) {
      const cycle = daysBetween(i.startedAt, i.completedAt);
      cycleAll.push(cycle);
      if (m === thisMonth) cycleThis.push(cycle);
      else if (m === thisMonth - 1) cycleLast.push(cycle);
    }
  }

  const mom = (now: number[], prev: number[]) => {
    const a = mean(now);
    const b = mean(prev);
    return a === null || b === null ? null : Math.round(a) - Math.round(b);
  };

  return {
    completedCount,
    avgLead: mean(leadAll),
    avgCycle: mean(cycleAll),
    leadMoM: mom(leadThis, leadLast),
    cycleMoM: mom(cycleThis, cycleLast),
  };
}

const fmt = (v: number | null) => (v === null ? '—' : `${Math.round(v)}d`);

/** Month-over-month delta. Lower lead/cycle time is better, so a decrease is
 *  shown in success green (↓) and an increase in destructive red (↑) — the
 *  existing semantic tokens, no new colours. */
function Delta({ value }: { value: number | null }) {
  if (value === null || value === 0) return null;
  const improved = value < 0;
  const Icon = improved ? ArrowDown : ArrowUp;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-medium tabular-nums',
        improved ? 'text-success' : 'text-destructive',
      )}
      title={t('roadmaps.vsLastMonth')}
    >
      <Icon className="size-3" aria-hidden />
      {Math.abs(value)}d
    </span>
  );
}

/** The (?) explainer — a light popover card with a mini timeline echoing the
 *  Requested → Started → Completed diagram. */
export function LeadCycleInfo({ className }: { className?: string }) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t('roadmaps.timing')}
            className={cn(
              'grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground',
              className,
            )}
          >
            <HelpCircle className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[300px] rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('roadmaps.timing')}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[10px] text-muted-foreground">
                  {t('roadmaps.leadTime')}
                </span>
                <div className="h-1.5 flex-1 rounded bg-primary/50" />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[10px] text-muted-foreground">
                  {t('roadmaps.cycleTime')}
                </span>
                <div className="flex-1">
                  <div className="ml-[45%] h-1.5 rounded bg-primary" />
                </div>
              </div>
              <div className="flex justify-between pl-16 text-[9px] uppercase tracking-wide text-muted-foreground">
                <span>{t('roadmaps.requested')}</span>
                <span>{t('roadmaps.started')}</span>
                <span>{t('roadmaps.completed')}</span>
              </div>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">{t('roadmaps.timingInfoLead')}</p>
            <p className="text-[11px] leading-snug text-muted-foreground">{t('roadmaps.timingInfoCycle')}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface Props {
  items: RoadmapItem[];
  /** `bar` = the roadmap-detail strip; `card` = the compact line on a list card. */
  variant?: 'bar' | 'card';
  className?: string;
}

/** Average lead & cycle time for a roadmap, with a month-over-month trend and an
 *  explainer — shown on the roadmaps list (per card) and the roadmap detail. */
export function RoadmapTimingSummary({ items, variant = 'bar', className }: Props) {
  const timing = useMemo(() => computeTiming(items), [items]);
  const { avgLead, avgCycle, leadMoM, cycleMoM, completedCount } = timing;

  // A list card with nothing completed stays clean — no empty metric line.
  if (variant === 'card') {
    if (completedCount === 0) return null;
    return (
      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground', className)}>
        <span className="inline-flex items-center gap-1">
          {t('roadmaps.leadTime')} <b className="font-mono text-foreground">{fmt(avgLead)}</b>
          <Delta value={leadMoM} />
        </span>
        <span className="inline-flex items-center gap-1">
          {t('roadmaps.cycleTime')} <b className="font-mono text-foreground">{fmt(avgCycle)}</b>
          <Delta value={cycleMoM} />
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card p-3 text-card-foreground shadow-sm',
        className,
      )}
    >
      <Metric label={t('roadmaps.avgLeadTime')} value={fmt(avgLead)} mom={leadMoM} />
      <span className="hidden h-8 w-px bg-border sm:block" aria-hidden />
      <Metric label={t('roadmaps.avgCycleTime')} value={fmt(avgCycle)} mom={cycleMoM} />
      <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {completedCount} {t('roadmaps.completedLabel')}
        </span>
        <LeadCycleInfo />
      </div>
    </div>
  );
}

function Metric({ label, value, mom }: { label: string; value: string; mom: number | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-xl font-bold tabular-nums text-foreground">{value}</span>
        <Delta value={mom} />
      </span>
    </div>
  );
}
