import { Link } from 'react-router-dom';
import { ArrowRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { RowsSkeleton } from '@/components/Skeletons';
import { t } from '@/i18n';
import { CycleMode } from '@/types/enums';
import type { CycleDto, TeamDto } from '@/types/dto';
import { useCycles } from '../api';
import { usePlanCycles } from '../usePlanCycles';
import { cycleName, cycleStatusBadge, cycleTimeHint, shortDay } from '../dates';
import { CycleFormDialog } from './CycleFormDialog';

/** How many cycles the settings card lists before deferring to the Cycles page.
 *  Settings is for planning what's next, not for reading a year of history. */
const VISIBLE = 5;

/**
 * The manual team's calendar, inside its settings: plan the next cycle, re-date
 * or rename one, delete one — without leaving the page where the cadence was
 * just chosen.
 *
 * It reads the **saved** team, not the editor's draft: creating a cycle is its
 * own immediate API call, and that call is rejected until `manual` has actually
 * been saved. So picking Manual shows this section straight away, but with a
 * "save first" line in place of the controls — rather than a button that would
 * 400.
 *
 * The full history, per-cycle progress and the insights drawer stay on the
 * team's Cycles page, which this links to.
 */
export function TeamCyclePlanner({ team }: { team: TeamDto }) {
  const ready = team.cyclesEnabled && team.cycleMode === CycleMode.MANUAL;
  const { data, isLoading } = useCycles(ready ? team.id : undefined);
  const plan = usePlanCycles(team.id);

  const cycles = data ?? [];
  const rows = cycles.slice(0, VISIBLE); // newest-first, as the API returns them

  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t('cycles.planned')}</p>
          <p className="text-xs text-muted-foreground">
            {ready ? t('cycles.plannedHint') : t('cycles.plannedSaveFirst')}
          </p>
        </div>
        {ready && (
          <Button variant="ghost" size="sm" onClick={plan.openCreate}>
            <Plus className="mr-1.5 size-3.5" />
            {t('cycles.newCycle')}
          </Button>
        )}
      </div>

      {ready &&
        (isLoading ? (
          <RowsSkeleton rows={2} />
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">{t('cycles.emptyManualHint')}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={plan.openCreate}>
              <Plus className="mr-1.5 size-3.5" />
              {t('cycles.newCycle')}
            </Button>
          </div>
        ) : (
          <>
            <div className="divide-y rounded-xl border">
              {rows.map((c) => (
                <PlannedCycleRow
                  key={c.id}
                  cycle={c}
                  onEdit={() => plan.openEdit(c)}
                  onDelete={() => plan.deleteCycle(c)}
                />
              ))}
            </div>
            {/* Only once something is hidden — otherwise the list above already
                is "all cycles" and the link would just be noise. */}
            {cycles.length > rows.length && (
              <Button asChild variant="link" size="sm" className="h-auto px-0">
                <Link to={`/teams/${team.id}/cycles`}>
                  {t('cycles.viewAll')}
                  <ArrowRight className="ml-1 size-3.5" />
                </Link>
              </Button>
            )}
          </>
        ))}

      <CycleFormDialog
        open={plan.form.open}
        onClose={plan.close}
        cycle={plan.form.cycle}
        cycles={cycles}
        submitting={plan.submitting}
        error={plan.error}
        onSubmit={plan.submit}
      />
    </div>
  );
}

/** One planned cycle: what it's called, where it sits in time, and the two
 *  things settings can do to it. Deliberately flatter than the Cycles page row —
 *  no progress bar or goal strip, since this is a schedule, not a report. */
function PlannedCycleRow({
  cycle,
  onEdit,
  onDelete,
}: {
  cycle: CycleDto;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const badge = cycleStatusBadge(cycle.status);
  const hint = cycleTimeHint(cycle);

  return (
    <div className="flex items-center gap-3 p-3 sm:px-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium">{cycleName(cycle)}</span>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {shortDay(cycle.startDate)} – {shortDay(cycle.endDate)}
          {hint && ` · ${hint}`}
        </p>
      </div>
      {/* Always visible rather than hover-revealed: this list is short, and a
          touch device has no hover to find them with. */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          aria-label={t('cycles.editCycle')}
          title={t('cycles.editCycle')}
          className="grid size-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('cycles.deleteCycle')}
          title={t('cycles.deleteCycle')}
          className="grid size-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
