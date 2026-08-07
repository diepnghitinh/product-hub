import { PIPELINE_STATE_COLOR, PIPELINE_STATE_LABEL, PipelineState } from '@/types/enums';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { timeAgo } from '@/lib/format';
import type { IssueDto } from '@/types/dto';

/** Just the CI fields, so this takes a `TaskDto`, a `BugDto` or an `IssueDto` —
 *  all three carry the same ones, because the API serves one shape for all. */
export type IssueCi = Pick<IssueDto, 'ciStatus' | 'ciBranch' | 'ciUpdatedAt'>;

/**
 * The reported state, or `null` when no pipeline ever named this issue.
 *
 * Every CI surface starts here and renders nothing on `null`: a workspace that
 * never connected a repo must not grow an "unknown" chip on every card, and in
 * one that did, "unknown" would be indistinguishable from "hasn't run yet".
 */
export function ciState(issue: IssueCi): PipelineState | null {
  const state = issue.ciStatus as PipelineState | '';
  return state ? state : null;
}

/**
 * The pipeline dot — the one place the CI colour language lives, so the detail
 * sidebar, a board card and a linked-issue row can't drift apart. Only a live
 * build pulses; `motion-safe` keeps it still for prefers-reduced-motion.
 */
export function CiStatusDot({ state, className }: { state: PipelineState; className?: string }) {
  const color = PIPELINE_STATE_COLOR[state];
  return (
    <span
      className={cn('relative grid size-2 shrink-0 place-items-center rounded-full', className)}
      style={{ backgroundColor: color }}
    >
      {state === PipelineState.RUNNING && (
        <span
          className="absolute inset-0 rounded-full motion-safe:animate-ping"
          style={{ backgroundColor: color }}
        />
      )}
    </span>
  );
}

/** Hover text carrying what the compact form has no room for: `CI/CD · passed · main · 5m ago`. */
export function ciTitle(issue: IssueCi, state: PipelineState): string {
  return [
    t('issue.ciStatus'),
    PIPELINE_STATE_LABEL[state],
    issue.ciBranch,
    issue.ciUpdatedAt ? timeAgo(issue.ciUpdatedAt) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Dot + state — the compact CI badge for anywhere that isn't the detail sidebar:
 * a board card's meta row, a sub-task row, a linked-issue row.
 *
 * Read-only like every CI surface (it's written solely by an inbound webhook),
 * and deliberately *not* a link: these all live inside a draggable card or a
 * clickable row, where a nested anchor would swallow the gesture. The branch and
 * the age ride in the tooltip instead of spending a second line.
 */
export function CiStatusChip({
  issue,
  /** Drop to the dot alone where a word won't fit. */
  labelled = true,
  /** Classes on the word — `hidden sm:inline` where it only fits on a big screen.
   *  The dot and the tooltip still carry the state, so nothing is lost. */
  labelClassName,
  className,
}: {
  issue: IssueCi;
  labelled?: boolean;
  labelClassName?: string;
  className?: string;
}) {
  const state = ciState(issue);
  if (!state) return null;

  const label = PIPELINE_STATE_LABEL[state];
  return (
    <span
      className={cn('flex min-w-0 items-center gap-1', className)}
      title={ciTitle(issue, state)}
      role="img"
      aria-label={`${t('issue.ciStatus')}: ${label}`}
    >
      <CiStatusDot state={state} />
      {labelled && (
        <span
          className={cn('min-w-0 truncate font-medium', labelClassName)}
          style={{ color: PIPELINE_STATE_COLOR[state] }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
