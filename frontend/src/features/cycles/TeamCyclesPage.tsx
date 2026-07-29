import { Fragment, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Plus, Settings2, Target, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, ProgressBar, Spinner } from '@/components/ui';
import { ListSkeleton } from '@/components/Skeletons';
import { BOARD_GUTTER, IssueBoardLayout } from '@/components/IssueBoardLayout';
import { CenteredPageLayout } from '@/layouts/shared';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { CycleMode, CycleStatus } from '@/types/enums';
import type { CycleDto } from '@/types/dto';
import { useTeams } from '@/features/teams/api';
import { TeamIconPicker } from '@/features/teams/TeamIconPicker';
import { useCreateCycle, useCycles, useDeleteCycle, useUpdateCycle, type CycleInput } from './api';
import { CycleFormDialog } from './components/CycleFormDialog';
import { CycleInsightsDrawer } from './CycleInsights';
import { addDays, cycleName, cycleStatusBadge, cycleTimeHint, dayDiff, shortDay } from './dates';

/**
 * A team's cycle history and plan: one row per cycle, newest first, with the
 * cooldown gaps drawn between rows. A row opens the team board filtered to that
 * cycle, and its goal strip opens the insights drawer, where the goal is written.
 *
 * Whether cycles can be created here depends on the team's cadence, which is set
 * in team settings. On an **automatic** team there is deliberately nothing to
 * create or close — the scheduler owns the calendar and would overwrite a
 * hand-made cycle. On a **manual** team this page is the calendar: plan, rename,
 * re-schedule and delete each cycle. Ending one stays automatic either way.
 */
export function TeamCyclesPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const { canManageDelivery } = useAuth();
  // The cycle whose insights drawer is open ('' = closed).
  const [insightsId, setInsightsId] = useState('');
  // The form dialog: closed, open on a cycle (edit), or open on nothing (create).
  const [form, setForm] = useState<{ open: boolean; cycle?: CycleDto }>({ open: false });
  const [formError, setFormError] = useState<string | null>(null);

  // Same resolution as TeamBoardPage: the route accepts an id or a team key.
  const team = (teams ?? []).find((x) => x.id === teamId || x.key === teamId);
  const { data: cycles, isLoading: cyclesLoading } = useCycles(team?.id);
  const create = useCreateCycle();
  const update = useUpdateCycle();
  const remove = useDeleteCycle();

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
  // Planning by hand is offered only where it takes effect: a manual-cadence
  // team, cycles on, and someone allowed to shape delivery. The API enforces the
  // same rules — this just doesn't offer a button that would be rejected.
  const canPlan =
    canManageDelivery && team.cyclesEnabled && team.cycleMode === CycleMode.MANUAL;

  /** One save path for both create and edit — the dialog can't tell which it is
   *  from the outside, and a server rejection (an overlap) belongs in it. */
  async function submitForm(values: CycleInput) {
    setFormError(null);
    try {
      if (form.cycle) {
        await update.mutateAsync({ teamId: team!.id, cycleId: form.cycle.id, ...values });
      } else {
        await create.mutateAsync({ teamId: team!.id, input: values });
      }
      setForm({ open: false });
    } catch (err) {
      // The dialog stays open holding the entered dates — the usual rejection is
      // an overlap with another cycle, which is fixed by nudging them, not by
      // starting over.
      setFormError((err as Error).message);
    }
  }

  async function deleteCycle(cycle: CycleDto) {
    if (!confirm(t('cycles.deleteConfirm').replace('{name}', cycleName(cycle)))) return;
    try {
      await remove.mutateAsync({ teamId: team!.id, cycleId: cycle.id });
      toast.success(t('cycles.deleted'));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <IssueBoardLayout
      title={team.name}
      subtitle={t('cycles.title')}
      titleIcon={<TeamIconPicker team={team} readOnly size={22} className="text-muted-foreground" />}
      actions={
        canManageDelivery ? (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link to={settingsTo}>
                <Settings2 className="mr-1.5 size-4" />
                {t('cycles.openSettings')}
              </Link>
            </Button>
            {canPlan && (
              <Button size="sm" onClick={() => setForm({ open: true })}>
                <Plus className="mr-1.5 size-4" />
                {t('cycles.newCycle')}
              </Button>
            )}
          </>
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
            {/* Two different dead-ends, two different ways out: a manual team has
                nothing to plan yet, an automatic one hasn't been switched on. */}
            <p className="mt-1 text-sm text-muted-foreground">
              {canPlan ? t('cycles.emptyManualHint') : t('cycles.emptyHint')}
            </p>
            {canPlan ? (
              <Button size="sm" className="mt-4" onClick={() => setForm({ open: true })}>
                <Plus className="mr-1.5 size-4" />
                {t('cycles.newCycle')}
              </Button>
            ) : (
              canManageDelivery && (
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link to={settingsTo}>{t('cycles.openSettings')}</Link>
                </Button>
              )
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
                    onEdit={canPlan ? () => setForm({ open: true, cycle: c }) : undefined}
                    onDelete={canPlan ? () => deleteCycle(c) : undefined}
                  />
                  {gapDays > 0 && next && (
                    <div className="flex items-center gap-3 px-1 text-xs text-muted-foreground">
                      <span className="h-px flex-1 border-t border-dashed" />
                      {/* "Cooldown" is rhythm vocabulary — a gap a manual team
                          left between two cycles it planned is just a gap. */}
                      {canPlan ? t('cycles.gap') : t('cycles.cooldown')} ·{' '}
                      {shortDay(addDays(next.endDate, 1))} – {shortDay(addDays(c.startDate, -1))}
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

      <CycleFormDialog
        open={form.open}
        onClose={() => {
          setForm({ open: false });
          setFormError(null);
        }}
        cycle={form.cycle}
        cycles={rows}
        submitting={create.isPending || update.isPending}
        error={formError}
        onSubmit={submitForm}
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
 *
 * `onEdit`/`onDelete` are absent on an automatic team (its calendar isn't the
 * team's to change), so the row simply has no such controls there.
 */
function CycleRow({
  cycle,
  teamId,
  canManageDelivery,
  onOpenGoal,
  onEdit,
  onDelete,
}: {
  cycle: CycleDto;
  teamId: string;
  canManageDelivery: boolean;
  onOpenGoal: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const navigate = useNavigate();
  const badge = cycleStatusBadge(cycle.status);
  const hint = cycleTimeHint(cycle);
  const pct = cycle.scopeCount ? (cycle.completedCount / cycle.scopeCount) * 100 : 0;
  const goal = cycle.description?.trim();
  // Offer "add a goal" only where it can still steer the work — a finished cycle
  // with no goal stays quiet rather than nagging down the whole history.
  const showGoal = !!goal || (canManageDelivery && cycle.status !== CycleStatus.COMPLETED);

  const name = cycleName(cycle);
  const actions = !!(onEdit || onDelete);

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-card transition-colors',
        cycle.status === CycleStatus.ACTIVE && 'border-primary/50',
      )}
    >
      <button
        type="button"
        onClick={() => navigate(`/teams/${teamId}?cycle=${cycle.id}`)}
        aria-label={`${name} — ${t('cycles.viewBoard')}`}
        className="block w-full p-4 text-left transition-colors hover:bg-accent/40"
      >
        {/* Room reserved on the right for the action cluster, which is a sibling
            of this button (a button can't nest buttons) and so overlays it. */}
        <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5', actions && 'pr-16')}>
          <span className="text-sm font-semibold">{name}</span>
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
      {actions && (
        // Faint until the row is hovered or focused, so a long history reads as
        // a list rather than a wall of icons — but never fully hidden, since a
        // touch device has no hover to reveal them with.
        <div className="absolute right-3 top-3 flex items-center rounded-md border bg-card opacity-60 shadow-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {onEdit && (
            <>
              <button
                type="button"
                onClick={onEdit}
                aria-label={t('cycles.editCycle')}
                title={t('cycles.editCycle')}
                className="grid size-7 place-items-center rounded-l-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Pencil className="size-3.5" />
              </button>
              <span className="h-4 w-px bg-border" aria-hidden />
            </>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={t('cycles.deleteCycle')}
              title={t('cycles.deleteCycle')}
              className="grid size-7 place-items-center rounded-r-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      )}
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
