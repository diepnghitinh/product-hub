import { Fragment, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Settings2, Target } from 'lucide-react';
import { Badge, Button, ProgressBar, Spinner } from '@/components/ui';
import { ListSkeleton } from '@/components/Skeletons';
import { BOARD_GUTTER, IssueBoardLayout } from '@/components/IssueBoardLayout';
import { CenteredPageLayout } from '@/layouts/shared';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { CycleStatus } from '@/types/enums';
import type { CycleDto } from '@/types/dto';
import { useTeams } from '@/features/teams/api';
import { TeamIconPicker } from '@/features/teams/TeamIconPicker';
import { useCycles } from './api';
import { CycleInsightsDrawer } from './CycleInsights';
import { addDays, cycleStatusBadge, cycleTimeHint, dayDiff, shortDay } from './dates';

/**
 * A team's cycle history and plan: one row per cycle, newest first, with the
 * cooldown gaps drawn between rows. There is deliberately nothing to create or
 * close here — cycles are automatic (the rhythm lives in team settings); a row
 * opens the team board filtered to that cycle, and its goal strip opens the
 * insights drawer, where the goal is written.
 */
export function TeamCyclesPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const { canManageDelivery } = useAuth();
  // The cycle whose insights drawer is open ('' = closed).
  const [insightsId, setInsightsId] = useState('');

  // Same resolution as TeamBoardPage: the route accepts an id or a team key.
  const team = (teams ?? []).find((x) => x.id === teamId || x.key === teamId);
  const { data: cycles, isLoading: cyclesLoading } = useCycles(team?.id);

  if (teamsLoading) {
    return (
      <CenteredPageLayout>
        <div className="grid place-items-center rounded-xl border border-dashed p-8">
          <Spinner />
        </div>
      </CenteredPageLayout>
    );
  }
  if (!team) {
    return (
      <CenteredPageLayout>
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t('teams.notFound')}{' '}
          <Link
            to="/"
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t('nav.home')}
          </Link>
        </div>
      </CenteredPageLayout>
    );
  }

  const rows = cycles ?? [];
  const settingsTo = `/admin/settings?tab=team:${team.id}`;

  return (
    <IssueBoardLayout
      title={team.name}
      subtitle={t('cycles.title')}
      titleIcon={<TeamIconPicker team={team} readOnly size={22} className="text-muted-foreground" />}
      actions={
        canManageDelivery ? (
          <Button asChild variant="ghost" size="sm">
            <Link to={settingsTo}>
              <Settings2 className="mr-1.5 size-4" />
              {t('cycles.openSettings')}
            </Link>
          </Button>
        ) : undefined
      }
    >
      {/* No toolbar on this page, so the content supplies its own vertical gap
          (same responsive values the roadmap board uses in this situation). */}
      <div className={cn('min-h-0 flex-1 overflow-y-auto py-4 md:py-6', BOARD_GUTTER)}>
        {cyclesLoading ? (
          <div className="mx-auto max-w-3xl">
            <ListSkeleton rows={5} />
          </div>
        ) : rows.length === 0 ? (
          <div className="mx-auto max-w-md rounded-xl border border-dashed p-10 text-center">
            <p className="font-medium">{t('cycles.empty')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('cycles.emptyHint')}</p>
            {canManageDelivery && (
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link to={settingsTo}>{t('cycles.openSettings')}</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-3">
            {rows.map((c, i) => {
              const next = rows[i + 1]; // newest-first ⇒ the previous cycle
              // A rhythm gap wider than the 1-day seam = cooldown; draw it.
              const gapDays = next ? dayDiff(next.endDate, c.startDate) - 1 : 0;
              return (
                <Fragment key={c.id}>
                  <CycleRow
                    cycle={c}
                    teamId={team.id}
                    canManageDelivery={canManageDelivery}
                    onOpenGoal={() => setInsightsId(c.id)}
                  />
                  {gapDays > 0 && next && (
                    <div className="flex items-center gap-3 px-1 text-xs text-muted-foreground">
                      <span className="h-px flex-1 border-t border-dashed" />
                      {t('cycles.cooldown')} · {shortDay(addDays(next.endDate, 1))} –{' '}
                      {shortDay(addDays(c.startDate, -1))}
                      <span className="h-px flex-1 border-t border-dashed" />
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* The goal lives in the insights drawer — the same one the board opens —
          so there is one editor, one permission gate and one save path. */}
      <CycleInsightsDrawer
        open={!!insightsId}
        onClose={() => setInsightsId('')}
        team={team}
        cycles={rows}
        selectedId={insightsId}
        onSelect={setInsightsId}
      />
    </IssueBoardLayout>
  );
}

/**
 * One cycle: the summary (opens the team board scoped to that cycle) and, under
 * it, the cycle's goal. The goal is read-only here and clicking it opens the
 * insights drawer to edit it — the strip is a separate button so a click on the
 * goal never navigates away, and viewers who can't set one and have none to read
 * get no strip at all.
 */
function CycleRow({
  cycle,
  teamId,
  canManageDelivery,
  onOpenGoal,
}: {
  cycle: CycleDto;
  teamId: string;
  canManageDelivery: boolean;
  onOpenGoal: () => void;
}) {
  const navigate = useNavigate();
  const badge = cycleStatusBadge(cycle.status);
  const hint = cycleTimeHint(cycle);
  const pct = cycle.scopeCount ? (cycle.completedCount / cycle.scopeCount) * 100 : 0;
  const goal = cycle.description?.trim();
  // Offer "add a goal" only where it can still steer the work — a finished cycle
  // with no goal stays quiet rather than nagging down the whole history.
  const showGoal = !!goal || (canManageDelivery && cycle.status !== CycleStatus.COMPLETED);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border bg-card transition-colors',
        cycle.status === CycleStatus.ACTIVE && 'border-primary/50',
      )}
    >
      <button
        type="button"
        onClick={() => navigate(`/teams/${teamId}?cycle=${cycle.id}`)}
        aria-label={`${t('cycles.cycle')} ${cycle.number} — ${t('cycles.viewBoard')}`}
        className="block w-full p-4 text-left transition-colors hover:bg-accent/40"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-sm font-semibold">
            {t('cycles.cycle')} {cycle.number}
          </span>
          <Badge variant={badge.variant}>{badge.label}</Badge>
          <span className="text-sm text-muted-foreground">
            {shortDay(cycle.startDate)} – {shortDay(cycle.endDate)}
            {hint && <span className="ml-2 text-xs">· {hint}</span>}
          </span>
          <span className="ml-auto text-sm tabular-nums text-muted-foreground">
            <span className="font-medium text-foreground">{cycle.completedCount}</span>
            {`/${cycle.scopeCount} ${t('cycles.issues')}`}
            {cycle.scopePoints > 0 && (
              <span className="ml-2">
                {cycle.completedPoints}/{cycle.scopePoints} {t('cycles.pts')}
              </span>
            )}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <ProgressBar value={pct} className="h-1.5 flex-1" />
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {Math.round(pct)}%
          </span>
        </div>
      </button>
      {showGoal && (
        <button
          type="button"
          onClick={onOpenGoal}
          aria-label={canManageDelivery ? t('cycles.goal.edit') : t('cycles.goal.title')}
          className="group flex w-full items-start gap-2 border-t px-4 py-2.5 text-left transition-colors hover:bg-accent/40"
        >
          <Target className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span
            className={cn(
              'line-clamp-2 min-w-0 flex-1 whitespace-pre-wrap text-[13px]',
              goal ? 'text-muted-foreground' : 'italic text-muted-foreground/70',
            )}
          >
            {goal || t('cycles.goal.add')}
          </span>
          {canManageDelivery && (
            <Pencil
              className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          )}
        </button>
      )}
    </div>
  );
}
