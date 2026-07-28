import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
} from 'lucide-react';
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

/** One issue inside an expanded status — its title, and its story points under the
 *  group's `Pts` column. Clicking it opens that issue's detail in a **new tab**
 *  (`/issues/:ref`, by ref so the URL is human-friendly), so the card you were
 *  reading stays put. The launcher glyph is always in the DOM (transparent until
 *  hover), so revealing it never nudges the row. */
function TaskRow({
  issue,
  done,
  showPoints,
}: {
  issue: IssueDto;
  done: boolean;
  showPoints: boolean;
}) {
  const href = `/issues/${issue.shortId || issue.id}`;
  return (
    <Link
      to={href}
      target="_blank"
      rel="noopener noreferrer"
      title={t('myteam.openInNewTab')}
      className="group flex items-center gap-2 rounded-md py-1.5 pl-1 pr-1.5 transition-colors hover:bg-accent"
    >
      <span
        className={cn('min-w-0 flex-1 truncate text-sm', done && 'text-muted-foreground line-through')}
      >
        {issue.title || t('roadmaps.untitled')}
      </span>
      {showPoints && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {issue.estimate > 0 ? issue.estimate : '—'}
        </span>
      )}
      <ExternalLink
        className="size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/70"
        aria-hidden
      />
    </Link>
  );
}

/** One status on a card. Its heading expands **in place** into that status's
 *  issues, so the person's summary above stays on screen — the reference's
 *  accordion. Colour (label + chevron) comes from the column, never hardcoded. */
function StatusGroup({ bucket, doneKey }: { bucket: ColumnBucket; doneKey: string }) {
  const [open, setOpen] = useState(false);
  // A points column only earns its place when something in the group is sized —
  // bugs carry no estimate, so a QC board gets the plain list instead.
  const showPoints = bucket.tasks.some((x) => x.estimate > 0);
  return (
    <div className="py-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-2 text-left transition-colors hover:bg-accent"
      >
        <ChevronDown
          className={cn('size-3.5 shrink-0 transition-transform duration-200', open && 'rotate-180')}
          style={{ color: bucket.col.color }}
          aria-hidden
        />
        <span
          className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide"
          style={{ color: bucket.col.color }}
        >
          {bucket.col.label}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          ({bucket.tasks.length})
        </span>
        {open && showPoints && (
          <span className="ml-auto shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('myteam.pointsColumn')}
          </span>
        )}
      </button>
      {open && (
        <div className="flex flex-col divide-y">
          {bucket.tasks.map((issue) => (
            <TaskRow
              key={issue.id}
              issue={issue}
              done={bucket.col.key === doneKey}
              showPoints={showPoints}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One person's workload. The summary shows counts, a share-complete ring, the
 *  status bar, an effort block (story points), then a status accordion — opening
 *  a status reveals its issues inline, beneath everything else (see StatusGroup).
 *  The header's ⌄⌄ control folds the whole card down to the person's name, for
 *  skimming a crowded board. Cards take their content's height and the PAGE
 *  scrolls, so nothing gets a nested scrollbar. */
export function WorkloadCard({ person }: { person: PersonWorkload }) {
  const groups = person.byColumn.filter((b) => b.tasks.length > 0);
  const [collapsed, setCollapsed] = useState(false);
  const CollapseIcon = collapsed ? ChevronsUpDown : ChevronsDownUp;

  return (
    <div className="flex flex-col rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
      {/* Header — who, plus the whole-card fold */}
      <div className="flex shrink-0 items-center gap-2.5">
        <PersonAvatar name={person.name} unassigned={person.isUnassigned} size={28} />
        <div
          className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
          title={person.name}
        >
          {person.name}
        </div>
        {/* Folded, the card still has to say how much this person is carrying. */}
        {collapsed && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {person.total}
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('myteam.expand') : t('myteam.collapse')}
          title={collapsed ? t('myteam.expand') : t('myteam.collapse')}
          className="-mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <CollapseIcon className="size-4" aria-hidden />
        </button>
      </div>

      {!collapsed && (
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
                  className={cn(
                    'flex items-center gap-1.5 text-xs',
                    person.totalPoints > 0 ? 'mt-2' : 'mt-1',
                  )}
                  style={{ color: 'hsl(var(--warning))' }}
                >
                  <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                  <span className="tabular-nums">
                    {person.noEstimateCount === 1
                      ? t('myteam.taskWithoutEstimateOne')
                      : t('myteam.tasksWithoutEstimate').replace(
                          '{count}',
                          String(person.noEstimateCount),
                        )}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Statuses — each opens in place into its issue list. */}
          {groups.length > 0 && (
            <div className="mt-3 border-t pt-1">
              <div className="flex flex-col divide-y">
                {groups.map((bucket) => (
                  <StatusGroup key={bucket.col.key} bucket={bucket} doneKey={person.doneKey} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
