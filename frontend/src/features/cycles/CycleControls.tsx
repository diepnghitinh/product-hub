import { Link } from 'react-router-dom';
import { CalendarClock, ChevronLeft, ChevronRight, CircleDot, CornerDownRight, Repeat } from 'lucide-react';
import {
  Badge,
  Button,
  ProgressBar,
  Select,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { BOARD_GUTTER } from '@/components/IssueBoardLayout';
import { useIssues } from '@/features/issues/api';
import { PropField, PropValue } from '@/features/issues/IssueDetail';
import { CycleIcon } from './CycleIcon';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  CYCLE_FILTER_CURRENT,
  CYCLE_FILTER_NONE,
  CYCLE_FILTER_UPCOMING,
  CycleStatus,
  IssueKind,
} from '@/types/enums';
import type { CycleDto, IssueDto, TeamDto } from '@/types/dto';
import { useCycles, useFocusedCycle } from './api';
import { cycleLabel, cycleStatusBadge, cycleTimeHint, daysLeftLabel, shortDay } from './dates';

/**
 * The board's cycle filter — a single-choice Select (a cycle is one window, so
 * this deliberately isn't a `FilterMenu` category, which is multi-select). The
 * sentinel options write `?cycle=current|upcoming|none`, which the API resolves
 * per-read, so a saved link never goes stale as cycles roll. Renders nothing
 * unless the team runs cycles.
 */
export function CycleFilterSelect({
  team,
  value,
  onChange,
}: {
  team: TeamDto | undefined;
  value: string;
  onChange: (value: string) => void;
}) {
  const enabled = !!team?.cyclesEnabled;
  const { data: cycles } = useCycles(enabled ? team?.id : undefined);
  if (!enabled) return null;

  const options = [
    { value: '', label: t('cycles.allCycles') },
    { value: CYCLE_FILTER_CURRENT, label: t('cycles.current') },
    { value: CYCLE_FILTER_UPCOMING, label: t('cycles.upcoming') },
    { value: CYCLE_FILTER_NONE, label: t('cycles.noCycle') },
    ...(cycles ?? []).map((c) => ({ value: c.id, label: cycleLabel(c) })),
  ];

  return (
    <Select
      className="min-w-[10rem]"
      value={value}
      onValueChange={onChange}
      options={options}
      aria-label={t('cycles.filterLabel')}
    />
  );
}

/**
 * The board's cycle context strip — the rich header a team board grows when it's
 * scoped to a single cycle (the sidebar's Current/Upcoming links, or a specific
 * cycle from the filter or the cycles page). It condenses a cycles-page row:
 * identity + status, the date window and days-left, the *live* progress (issues
 * and points), and `‹ ›` to step to the neighbouring cycle. Renders nothing for
 * All-cycles / No-cycle scope — there's no single cycle to feature, and its
 * progress would contradict the unfiltered list; the toolbar's `CycleChip`
 * carries the ambient rhythm there instead. Because it's one cycle, the numbers
 * here always match the board below it.
 *
 * It's board-shell chrome, so it rides the shell's `banner` slot (not a page's
 * hand-rolled markup) — every board that fills that slot moves together.
 */
export function CycleBoardBanner({
  team,
  value,
  onChange,
}: {
  team: TeamDto | undefined;
  value: string;
  onChange: (value: string) => void;
}) {
  const enabled = !!team?.cyclesEnabled;
  const { data: cycles } = useCycles(enabled ? team?.id : undefined);
  const focused = useFocusedCycle(team, value);
  if (!enabled || !focused || !cycles) return null;

  // Cycles are newest-first, so the neighbour toward the future sits at the
  // previous index and the past at the next — `‹` steps back in time, `›` forward.
  const idx = cycles.findIndex((c) => c.id === focused.id);
  const newer = idx > 0 ? cycles[idx - 1] : undefined; // more recent / upcoming
  const older = idx >= 0 && idx < cycles.length - 1 ? cycles[idx + 1] : undefined; // further past

  const badge = cycleStatusBadge(focused.status);
  const hint = cycleTimeHint(focused);
  const pct = focused.scopeCount ? (focused.completedCount / focused.scopeCount) * 100 : 0;

  return (
    <div className={cn('shrink-0', BOARD_GUTTER)}>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border bg-card px-2.5 py-2 text-card-foreground shadow-sm">
        {/* Identity, flanked by the step controls. The middle group wraps on
            narrow widths instead of truncating, so the days-left never clips. */}
        <div className="flex min-w-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            onClick={() => older && onChange(older.id)}
            disabled={!older}
            aria-label={t('cycles.prevCycle')}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-1">
            <CycleIcon className="text-muted-foreground" />
            <span className="text-sm font-semibold">
              {t('cycles.cycle')} {focused.number}
            </span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
            <span className="text-sm text-muted-foreground">
              {shortDay(focused.startDate)} – {shortDay(focused.endDate)}
              {hint && <span className="ml-1.5 whitespace-nowrap text-xs">· {hint}</span>}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            onClick={() => newer && onChange(newer.id)}
            disabled={!newer}
            aria-label={t('cycles.nextCycle')}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Live progress + a link to the full rhythm */}
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <ProgressBar value={pct} className="h-1.5 w-24 sm:w-32" />
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {Math.round(pct)}%
            </span>
          </div>
          <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
            <span className="font-medium text-foreground">{focused.completedCount}</span>
            {`/${focused.scopeCount} ${t('cycles.issues')}`}
            {focused.scopePoints > 0 && (
              <span className="ml-2">
                {focused.completedPoints}/{focused.scopePoints} {t('cycles.pts')}
              </span>
            )}
          </span>
          <Link
            to={`/teams/${team!.id}/cycles`}
            title={t('cycles.title')}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <CalendarClock className="size-3.5" aria-hidden />
            {t('cycles.viewAll')}
          </Link>
        </div>

        {/* A closed cycle grows a second row: who was unfinished when it closed.
            Without it the board below shows only the finishers (the sweep moved
            everyone else away) and silently disagrees with the frozen numbers. */}
        {focused.status === CycleStatus.COMPLETED && (
          <ClosedCycleLeftovers team={team!} cycle={focused} cycles={cycles} />
        )}
      </div>
    </div>
  );
}

/**
 * The "who left" strip of a closed cycle's banner — renders the frozen
 * `unfinishedIds` as chips linking to the issues (which no longer point at this
 * cycle, so the board can't show them). Cycles closed before the record existed
 * only have counts: those get a count-only line derived from the frozen stats
 * (`scope − completed` — exactly how many the sweep moved). Fully-finished
 * cycles render nothing.
 */
function ClosedCycleLeftovers({
  team,
  cycle,
  cycles,
}: {
  team: TeamDto;
  cycle: CycleDto;
  cycles: CycleDto[];
}) {
  const left = cycle.unfinishedIds.length;
  const countOnly = Math.max(0, cycle.scopeCount - cycle.completedCount);
  if (!left && !countOnly) return null;

  return (
    <div className="w-full border-t pt-2">
      {left ? (
        <GhostChips team={team} cycle={cycle} cycles={cycles} />
      ) : (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CornerDownRight className="size-3.5 shrink-0" aria-hidden />
          {countOnly} {t('cycles.carriedCountOnly')}
        </span>
      )}
    </div>
  );
}

/** Fetches and renders the ghosts. Mounted only when `unfinishedIds` is
 *  non-empty — an empty `ids` filter would mean "no filter" and fetch the world. */
function GhostChips({
  team,
  cycle,
  cycles,
}: {
  team: TeamDto;
  cycle: CycleDto;
  cycles: CycleDto[];
}) {
  // The backend caps a page at 100 — plenty for one cycle's leftovers; the
  // header count stays honest either way.
  const { data } = useIssues({ ids: cycle.unfinishedIds.slice(0, 100) });
  const ghosts = data?.items ?? [];
  // Deleted since — a historical record keeps no dangling chips, just a tally.
  const gone = data ? Math.max(0, cycle.unfinishedIds.length - ghosts.length) : 0;
  const header = team.cycleAutoRollover ? t('cycles.carriedAtClose') : t('cycles.returnedAtClose');

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <CornerDownRight className="size-3.5 shrink-0" aria-hidden />
        {header} ({cycle.unfinishedIds.length})
      </span>
      {ghosts.map((g) => (
        <GhostChip key={g.id} issue={g} cycles={cycles} />
      ))}
      {gone > 0 && (
        <span className="text-xs text-muted-foreground">
          · {gone} {t('cycles.noLongerAvailable')}
        </span>
      )}
    </div>
  );
}

/** One carried issue: ref + title linking to its detail, suffixed with where it
 *  lives now (a later cycle, or the backlog when rollover was off / it was
 *  detached). The suffix reads from the issue's *current* `cycleId` — the ghost
 *  is history, the destination is live. */
function GhostChip({ issue, cycles }: { issue: IssueDto; cycles: CycleDto[] }) {
  // Route to the right detail page by kind — a bug chip must not open /tasks/…
  const ref = issue.shortId || issue.id;
  const to = issue.kind === IssueKind.BUG ? `/bugs/${ref}` : `/tasks/${ref}`;
  const now = issue.cycleId ? cycles.find((c) => c.id === issue.cycleId) : undefined;
  const where = issue.cycleId
    ? now && `${t('cycles.cycle')} ${now.number}`
    : t('cycles.toBacklog');

  return (
    <Link
      to={to}
      title={issue.title}
      className="inline-flex max-w-64 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent"
    >
      {issue.shortId && (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{issue.shortId}</span>
      )}
      <span className="min-w-0 truncate">{issue.title || t('roadmaps.untitled')}</span>
      {where && (
        <span className="shrink-0 whitespace-nowrap text-muted-foreground">→ {where}</span>
      )}
    </Link>
  );
}

/**
 * "↻ Carried over ×2" — marks an issue the scheduler auto-rolled into the next
 * cycle because it was still unfinished when its cycle ended. The `×N` shows the
 * slip count only past the first (a lone "Carried over" already means "once").
 * Renders nothing for an issue that started fresh in its cycle (count 0), so it's
 * safe to drop into any card/detail slot. Lives here beside the cycle chips
 * because both the board card and the issue detail render it.
 */
export function CarryOverBadge({ count }: { count?: number }) {
  if (!count || count < 1) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="warning" className="gap-1 px-1.5 py-0 text-[11px] font-normal">
          <Repeat className="size-3 shrink-0" aria-hidden />
          {t('cycles.carriedOver')}
          {count > 1 && <span className="tabular-nums">×{count}</span>}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{t('cycles.carriedOverHint')}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The issue-detail "Cycle" property row: *No cycle · Current · Upcoming…* —
 * only the team's not-yet-finished cycles are joinable (the backend rejects
 * completed ones; they're history). A done issue keeps pointing at its
 * completed cycle — that value stays visible but locked. When the issue was
 * carried over, a {@link CarryOverBadge} sits under the control. Renders nothing
 * unless the owning team runs cycles, so non-cycle teams see no row at all.
 */
export function CyclePropField({
  team,
  value,
  canWrite,
  carryOverCount,
  onChange,
}: {
  team: TeamDto | undefined;
  value: string;
  canWrite: boolean;
  carryOverCount?: number;
  onChange: (value: string) => void;
}) {
  const enabled = !!team?.cyclesEnabled;
  const { data: cycles } = useCycles(enabled ? team?.id : undefined);
  if (!enabled) return null;

  // Newest-first from the API; the picker reads better current-first.
  const open = (cycles ?? []).filter((c) => c.status !== CycleStatus.COMPLETED).reverse();
  const picked = (cycles ?? []).find((c) => c.id === value);
  const stale = value && picked && !open.some((c) => c.id === value) ? picked : undefined;

  const options = [
    { value: '', label: t('cycles.noCycle') },
    ...open.map((c) => ({
      value: c.id,
      label:
        c.status === CycleStatus.ACTIVE
          ? `${cycleLabel(c)} · ${t('cycles.current')}`
          : cycleLabel(c),
    })),
    ...(stale ? [{ value: stale.id, label: cycleLabel(stale), disabled: true }] : []),
  ];

  return (
    <PropField bare label={t('cycles.cycle')}>
      {canWrite ? (
        <Select
          className="w-full"
          value={value}
          onValueChange={onChange}
          options={options}
          aria-label={t('cycles.cycle')}
        />
      ) : (
        <PropValue icon={<CircleDot />} muted={!picked}>
          {picked ? cycleLabel(picked) : t('cycles.noCycle')}
        </PropValue>
      )}
      {carryOverCount ? (
        <div className="mt-1.5 pl-3">
          <CarryOverBadge count={carryOverCount} />
        </div>
      ) : null}
    </PropField>
  );
}

/**
 * "Cycle 12 · 4 days left" — the board's live link into the cycles page.
 * During cooldown it reads "Cooldown until {next start}" (a rhythm gap has no
 * current cycle by design). Renders nothing unless the team runs cycles.
 */
export function CycleChip({ team }: { team: TeamDto | undefined }) {
  const enabled = !!team?.cyclesEnabled;
  const { data: cycles } = useCycles(enabled ? team?.id : undefined);
  if (!enabled || !cycles?.length) return null;

  const active = cycles.find((c) => c.status === CycleStatus.ACTIVE);
  // Newest-first ⇒ the soonest upcoming cycle is the *last* upcoming in the list.
  const upcoming = [...cycles].reverse().find((c) => c.status === CycleStatus.UPCOMING);
  let label: string;
  if (active) {
    label = `${t('cycles.cycle')} ${active.number} · ${daysLeftLabel(active.endDate)}`;
  } else if (upcoming) {
    label = `${t('cycles.cooldownUntil')} ${shortDay(upcoming.startDate)}`;
  } else {
    return null;
  }

  return (
    <Link
      to={`/teams/${team!.id}/cycles`}
      title={t('cycles.title')}
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <CycleIcon />
      {label}
    </Link>
  );
}
