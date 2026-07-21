import { daysBetween, daysSince, formatDate } from '@/lib/format';
import { t } from '@/i18n';
import type { RoadmapItem } from '@/types/dto';
import { RoadmapTimingSummary } from './RoadmapTimingSummary';

/** A finished duration, e.g. "10d" / "<1d" — dash when an endpoint is missing. */
const dur = (from?: string, to?: string) =>
  from && to ? (daysBetween(from, to) === 0 ? t('roadmaps.underDay') : `${daysBetween(from, to)}d`) : '—';

interface Row {
  id: string;
  title: string;
  requested: string;
  started: string;
  completed: string;
  lead: string;
  cycle: string;
}

/**
 * The Workflow view — a roadmap's lead & cycle time analytics gathered in one
 * place: the average summary (with its month-over-month trend and explainer) up
 * top, then a per-item breakdown of completed work, and anything still in flight
 * with its clock running.
 */
export function RoadmapWorkflowView({ items }: { items: RoadmapItem[] }) {
  // Newest completion first — the most recent throughput reads at the top.
  const completed = items
    .filter((i) => i.completedAt)
    .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1));
  // Started but not done — show the lead/cycle accrued so far.
  const inFlight = items
    .filter((i) => i.startedAt && !i.completedAt)
    .sort((a, b) => (a.startedAt! < b.startedAt! ? 1 : -1));

  return (
    <div className="flex flex-col gap-6">
      <RoadmapTimingSummary items={items} variant="bar" />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">{t('roadmaps.completedItems')}</h2>
        {completed.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t('roadmaps.noCompleted')}
          </p>
        ) : (
          <TimingTable
            rows={completed.map((i) => ({
              id: i.id,
              title: i.title,
              requested: i.createdAt ? formatDate(i.createdAt) : '—',
              started: i.startedAt ? formatDate(i.startedAt) : '—',
              completed: formatDate(i.completedAt!),
              lead: dur(i.createdAt, i.completedAt),
              cycle: dur(i.startedAt, i.completedAt),
            }))}
          />
        )}
      </section>

      {inFlight.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">{t('roadmaps.inFlight')}</h2>
          <TimingTable
            rows={inFlight.map((i) => ({
              id: i.id,
              title: i.title,
              requested: i.createdAt ? formatDate(i.createdAt) : '—',
              started: formatDate(i.startedAt!),
              completed: '—',
              // Running so far — measured to now rather than to a completion.
              lead: i.createdAt ? `${daysSince(i.createdAt)}d` : '—',
              cycle: `${daysSince(i.startedAt!)}d`,
            }))}
          />
        </section>
      )}
    </div>
  );
}

/** Item · Requested · Started · Completed · Lead · Cycle. Scrolls sideways on
 *  narrow screens rather than squashing the columns. */
function TimingTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">{t('roadmaps.item')}</th>
            <th className="px-4 py-2 font-medium">{t('roadmaps.requested')}</th>
            <th className="px-4 py-2 font-medium">{t('roadmaps.started')}</th>
            <th className="px-4 py-2 font-medium">{t('roadmaps.completed')}</th>
            <th className="px-4 py-2 text-right font-medium">{t('roadmaps.leadTime')}</th>
            <th className="px-4 py-2 text-right font-medium">{t('roadmaps.cycleTime')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-accent/40">
              <td className="max-w-[240px] truncate px-4 py-2 font-medium text-foreground" title={r.title}>
                {r.title}
              </td>
              <td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted-foreground">{r.requested}</td>
              <td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted-foreground">{r.started}</td>
              <td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted-foreground">{r.completed}</td>
              <td className="px-4 py-2 text-right font-mono font-semibold text-foreground">{r.lead}</td>
              <td className="px-4 py-2 text-right font-mono font-semibold text-foreground">{r.cycle}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
