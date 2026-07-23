import { Fragment } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { Badge, Button, ProgressBar, Spinner } from '@/components/ui';
import { BOARD_GUTTER, IssueBoardLayout } from '@/components/IssueBoardLayout';
import { CenteredPageLayout } from '@/layouts/shared';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { CycleStatus } from '@/types/enums';
import { useTeams } from '@/features/teams/api';
import { TeamIconPicker } from '@/features/teams/TeamIconPicker';
import { useCycles } from './api';
import { addDays, cycleStatusBadge, cycleTimeHint, dayDiff, shortDay } from './dates';

/**
 * A team's cycle history and plan: one row per cycle, newest first, with the
 * cooldown gaps drawn between rows. There is deliberately nothing to create or
 * close here — cycles are automatic (the rhythm lives in team settings); a row
 * opens the team board filtered to that cycle.
 */
export function TeamCyclesPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const { canManageDelivery } = useAuth();
  const navigate = useNavigate();

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
          <div className="grid place-items-center rounded-xl border border-dashed p-8">
            <Spinner />
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
              const badge = cycleStatusBadge(c.status);
              const hint = cycleTimeHint(c);
              const pct = c.scopeCount ? (c.completedCount / c.scopeCount) * 100 : 0;
              return (
                <Fragment key={c.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/teams/${team.id}?cycle=${c.id}`)}
                    aria-label={`${t('cycles.cycle')} ${c.number} — ${t('cycles.viewBoard')}`}
                    className={cn(
                      'block w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/40',
                      c.status === CycleStatus.ACTIVE && 'border-primary/50',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="text-sm font-semibold">
                        {t('cycles.cycle')} {c.number}
                      </span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {shortDay(c.startDate)} – {shortDay(c.endDate)}
                        {hint && <span className="ml-2 text-xs">· {hint}</span>}
                      </span>
                      <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                        <span className="font-medium text-foreground">{c.completedCount}</span>
                        {`/${c.scopeCount} ${t('cycles.issues')}`}
                        {c.scopePoints > 0 && (
                          <span className="ml-2">
                            {c.completedPoints}/{c.scopePoints} {t('cycles.pts')}
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
    </IssueBoardLayout>
  );
}
