import { useMemo } from 'react';
import { t } from '@/i18n';
import { PersonAvatar, WorkloadCard } from './WorkloadCard';
import type { PersonWorkload } from './workload';

/**
 * The "who's carrying what" cell — a vertical bar per person (their load relative to
 * the busiest), avatar beneath, like the reference. Fills its grid cell so it reads
 * the same height as the person cards beside it. Only worth showing with >1 person.
 */
function WorkloadSummary({ people }: { people: PersonWorkload[] }) {
  const maxTotal = Math.max(...people.map((p) => p.total), 1);
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
      <h2 className="shrink-0 text-sm font-semibold text-foreground">{t('myteam.workload')}</h2>
      <div className="mt-4 flex min-h-0 flex-1 items-stretch gap-1.5">
        {people.map((person) => {
          const pct = Math.max(Math.round((person.total / maxTotal) * 100), 6);
          return (
            <div key={person.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-1 items-end justify-center">
                <div
                  className="flex h-full w-2.5 items-end overflow-hidden rounded-full bg-primary/10"
                  title={`${person.name}: ${person.total}`}
                >
                  <div
                    className="w-full rounded-full bg-primary transition-[height] duration-500"
                    style={{ height: `${pct}%` }}
                  />
                </div>
              </div>
              <PersonAvatar name={person.name} unassigned={person.isUnassigned} size={24} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The Box view: a responsive grid of fixed-height (~300px) cards — the Workload chart
 * first, then the Unassigned bucket, then a card per person. Each card scrolls its task
 * list in-card, so the grid stays a tidy set of equal-height tiles however much work a
 * person is carrying. Wraps to fewer columns as the screen narrows (1 up on mobile).
 */
export function TeamWorkloadView({ people }: { people: PersonWorkload[] }) {
  // Unassigned rides up front (right after the Workload chart), then the real people.
  const ordered = useMemo(() => {
    const unassigned = people.filter((p) => p.isUnassigned);
    const assigned = people.filter((p) => !p.isUnassigned);
    return [...unassigned, ...assigned];
  }, [people]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {people.length > 1 && (
        <div className="h-[300px]">
          {/* Chart bars follow the card order — Unassigned first (position 0). */}
          <WorkloadSummary people={ordered} />
        </div>
      )}
      {ordered.map((person) => (
        <div key={person.id} className="h-[300px]">
          <WorkloadCard person={person} />
        </div>
      ))}
    </div>
  );
}
