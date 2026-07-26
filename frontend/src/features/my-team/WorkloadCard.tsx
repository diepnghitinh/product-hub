import { useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import type { IssueDto } from '@/types/dto';
import { ProgressRing } from './ProgressRing';
import { initialsOf, type ColumnBucket, type PersonWorkload } from './workload';

/** Round avatar of initials — brand fill for a person, muted for the Unassigned bucket. */
export function PersonAvatar({
  name,
  unassigned,
  size = 36,
}: {
  name: string;
  unassigned?: boolean;
  size?: number;
}) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full text-xs font-semibold',
        unassigned ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground',
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {unassigned ? '—' : initialsOf(name)}
    </span>
  );
}

/** The stacked status bar — one segment per non-empty column, width by task count,
 *  colour from the column itself (never hardcoded). Shared with the Workload summary. */
export function StatusBar({ buckets, className }: { buckets: ColumnBucket[]; className?: string }) {
  const shown = buckets.filter((b) => b.tasks.length > 0);
  return (
    <div className={cn('flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted', className)}>
      {shown.map(({ col, tasks }) => (
        <div
          key={col.key}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ flexGrow: tasks.length, backgroundColor: col.color }}
          title={`${col.label}: ${tasks.length}`}
        />
      ))}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-xl font-semibold leading-none tabular-nums text-foreground">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

/** One issue in a drilled-in status list — title + optional estimate. Read-only:
 *  the drill-in is a focused list, not a launcher, so Back (inside the card) is the
 *  only way out. */
function TaskRow({ issue, done }: { issue: IssueDto; done: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1.5 pl-1 pr-1.5">
      <span className={cn('min-w-0 flex-1 truncate text-sm', done && 'text-muted-foreground line-through')}>
        {issue.title || t('roadmaps.untitled')}
      </span>
      {issue.estimate > 0 && (
        <Badge variant="muted" className="shrink-0 font-mono text-[10px]">
          {issue.estimate} {t('myteam.points')}
        </Badge>
      )}
    </div>
  );
}

/** The card's drilled-in view: a Back control *inside the card*, the status label,
 *  then that status's issues — this replaces the card's summary until Back is hit. */
function FocusedStatus({
  bucket,
  doneKey,
  onBack,
}: {
  bucket: ColumnBucket;
  doneKey: string;
  onBack: () => void;
}) {
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t('myteam.back')}
      </button>
      <div className="mb-1 mt-2 flex items-center gap-2 border-t pt-2.5">
        <span
          className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide"
          style={{ color: bucket.col.color }}
        >
          {bucket.col.label}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">({bucket.tasks.length})</span>
      </div>
      <div className="flex flex-col divide-y">
        {bucket.tasks.map((issue) => (
          <TaskRow key={issue.id} issue={issue} done={bucket.col.key === doneKey} />
        ))}
      </div>
    </div>
  );
}

/** One person's workload. Its summary shows counts, a share-complete ring, the status
 *  bar, an effort block (story points), and a compact index of statuses. Clicking a
 *  status heading drills *in place* into that status's item list (see FocusedStatus) —
 *  a Back button inside the card returns to this summary. The card takes its content's
 *  height and the PAGE scrolls (no nested list scrollbar). */
export function WorkloadCard({ person }: { person: PersonWorkload }) {
  const groups = person.byColumn.filter((b) => b.tasks.length > 0);
  // The status drilled into, or null for the summary. Clicking a status heading
  // sets it; Back clears it — all within this one card.
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const focused = focusedKey ? groups.find((g) => g.col.key === focusedKey) ?? null : null;

  return (
    <div className="flex flex-col rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
      {/* Header — who (kept in both views, so a drilled-in list still says whose it is) */}
      <div className="flex shrink-0 items-center gap-2.5">
        <PersonAvatar name={person.name} unassigned={person.isUnassigned} size={28} />
        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={person.name}>
          {person.name}
        </div>
      </div>

      {focused ? (
        <FocusedStatus bucket={focused} doneKey={person.doneKey} onBack={() => setFocusedKey(null)} />
      ) : (
        <>
          {/* Counts + share complete */}
          <div className="mt-4 flex shrink-0 items-center gap-5">
            <Stat value={person.notDoneCount} label={t('myteam.notDone')} />
            <Stat value={person.doneCount} label={t('myteam.done')} />
            <div className="ml-auto">
              <ProgressRing value={person.progressPct} />
            </div>
          </div>

          {/* Status distribution */}
          <div className="mt-3.5 shrink-0">
            <StatusBar buckets={person.byColumn} />
          </div>

          {/* Effort — story points, laid out like the reference's estimate block:
              points still to do / done, with a ring of the number of points left. */}
          {(person.totalPoints > 0 || person.noEstimateCount > 0) && (
            <div className="mt-4 shrink-0">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('myteam.storyPoints')}
              </div>
              {person.totalPoints > 0 && (
                <div className="mt-2 flex items-center gap-5">
                  <Stat value={person.remainingPoints} label={t('myteam.notDone')} />
                  <Stat value={person.donePoints} label={t('myteam.done')} />
                  <div className="ml-auto">
                    <ProgressRing value={(person.donePoints / person.totalPoints) * 100} size={44}>
                      {person.remainingPoints}
                    </ProgressRing>
                  </div>
                </div>
              )}
              {person.noEstimateCount > 0 && (
                <div
                  className={cn('flex items-center gap-1.5 text-xs', person.totalPoints > 0 ? 'mt-2' : 'mt-1')}
                  style={{ color: 'hsl(var(--warning))' }}
                >
                  <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                  <span className="tabular-nums">
                    {person.noEstimateCount === 1
                      ? t('myteam.taskWithoutEstimateOne')
                      : t('myteam.tasksWithoutEstimate').replace('{count}', String(person.noEstimateCount))}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Status index — a heading per non-empty status; click one to drill into
              its item list in place. Colour comes from the column (never hardcoded). */}
          {groups.length > 0 && (
            <div className="mt-3 border-t pt-1">
              <div className="flex flex-col divide-y">
                {groups.map((bucket) => (
                  <button
                    key={bucket.col.key}
                    type="button"
                    onClick={() => setFocusedKey(bucket.col.key)}
                    aria-label={bucket.col.label}
                    className="flex w-full items-center gap-2 rounded-md px-1 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <span
                      className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide"
                      style={{ color: bucket.col.color }}
                    >
                      {bucket.col.label}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      ({bucket.tasks.length})
                    </span>
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
