import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { IssueKind } from '@/types/enums';
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

function TaskRow({ issue, done }: { issue: IssueDto; done: boolean }) {
  // Route to the right detail page by kind — a bug row must not open /tasks/…
  const ref = issue.shortId || issue.id;
  const to = issue.kind === IssueKind.BUG ? `/bugs/${ref}` : `/tasks/${ref}`;
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-md py-1.5 pl-6 pr-1.5 transition-colors hover:bg-accent"
    >
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          done && 'text-muted-foreground line-through',
        )}
      >
        {issue.title || t('roadmaps.untitled')}
      </span>
      {issue.estimate > 0 && (
        <Badge variant="muted" className="shrink-0 font-mono text-[10px]">
          {issue.estimate} {t('myteam.points')}
        </Badge>
      )}
    </Link>
  );
}

/** A collapsible status section inside a person's card (To do, In progress, …). */
function StatusGroup({
  bucket,
  doneKey,
  open,
  onToggle,
}: {
  bucket: ColumnBucket;
  doneKey: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="py-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-accent"
      >
        <ChevronRight
          className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
          aria-hidden
        />
        <span
          className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide"
          style={{ color: bucket.col.color }}
        >
          {bucket.col.label}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">({bucket.tasks.length})</span>
      </button>
      {open && (
        <div className="mt-0.5 flex flex-col">
          {bucket.tasks.map((issue) => (
            <TaskRow key={issue.id} issue={issue} done={bucket.col.key === doneKey} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One person's workload — counts, a share-complete ring, the status bar, an
 *  effort block (story points), and their tasks grouped by status. Sized to fill
 *  its column so every card in the Box row is the same height; the status groups
 *  start collapsed (a compact index of statuses) and the list scrolls in-card. */
export function WorkloadCard({ person }: { person: PersonWorkload }) {
  const groups = person.byColumn.filter((b) => b.tasks.length > 0);
  // Issues start collapsed, per the reference — expand a status to reveal its tasks.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const allExpanded = groups.length > 0 && groups.every((g) => expanded.has(g.col.key));
  const toggleAll = () => setExpanded(allExpanded ? new Set() : new Set(groups.map((g) => g.col.key)));

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
      {/* Header — who, with a collapse/expand-all toggle */}
      <div className="flex shrink-0 items-center gap-2.5">
        <PersonAvatar name={person.name} unassigned={person.isUnassigned} size={28} />
        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={person.name}>
          {person.name}
        </div>
        {groups.length > 0 && (
          <button
            type="button"
            onClick={toggleAll}
            aria-label={allExpanded ? t('myteam.collapseAll') : t('myteam.expandAll')}
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {allExpanded ? <ChevronsDownUp className="size-4" /> : <ChevronsUpDown className="size-4" />}
          </button>
        )}
      </div>

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

      {/* Grouped tasks — fill the rest of the column; scroll in-card when long */}
      {groups.length > 0 && (
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-t pt-1">
          <div className="flex flex-col divide-y">
            {groups.map((bucket) => (
              <StatusGroup
                key={bucket.col.key}
                bucket={bucket}
                doneKey={person.doneKey}
                open={expanded.has(bucket.col.key)}
                onToggle={() => toggle(bucket.col.key)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
