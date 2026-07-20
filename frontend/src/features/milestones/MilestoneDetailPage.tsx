import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileText, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button, Input, ProgressBar, Select, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { PageHeader } from '@/layouts/headers/PageHeader';
import {
  MILESTONE_STATUS_LABEL,
  MILESTONE_STATUSES,
  MilestoneStatus,
  OKR_STATUS_COLOR,
  OKR_STATUS_LABEL,
  OKR_STATUSES,
  OkrStatus,
} from '@/types/enums';
import type { KeyResult, Objective } from '@/types/dto';
import { useDeleteMilestone, useMilestone, useReplaceObjectives, useUpdateMilestone } from './api';
import { WeightSplitBar, krLabel } from './components/WeightSplitBar';
import { OBJECTIVE_WEIGHT, TOTAL_WEIGHT, distributeEvenly, setWeight } from './weights';
import { CenteredPageLayout } from '@/layouts/shared';

// Right-hand column widths, shared by the header + objective/KR rows so they align.
const COL = {
  status: 'w-[124px] shrink-0',
  score: 'w-[52px] shrink-0 text-center',
  weight: 'w-[104px] shrink-0',
  record: 'w-[44px] shrink-0 text-center',
  del: 'w-8 shrink-0',
};

const clampPct = (v: string, max = 100) => Math.max(0, Math.min(max, Number(v) || 0));

/** Always 100 once saved — shown so the rule is visible rather than implied. */
const krTotal = (o: Objective) => o.keyResults.reduce((n, k) => n + k.weight, 0);

/** Qualitative status pill — a colour-dotted Select (read-only chip when locked). */
function StatusChip({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const known = OKR_STATUSES.find((s) => s === value);
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
        {known && (
          <span
            className="size-2 rounded-full"
            style={{ background: OKR_STATUS_COLOR[known] }}
            aria-hidden
          />
        )}
        {known ? OKR_STATUS_LABEL[known] : t('milestones.noStatus')}
      </span>
    );
  }
  return (
    <Select
      value={value}
      onValueChange={onChange}
      className="h-7 w-full rounded-full text-xs"
      aria-label={t('milestones.status')}
      options={[
        { value: '', label: <span className="text-muted-foreground">{t('milestones.noStatus')}</span> },
        ...OKR_STATUSES.map((s: OkrStatus) => ({
          value: s,
          label: (
            <span className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ background: OKR_STATUS_COLOR[s] }}
                aria-hidden
              />
              {OKR_STATUS_LABEL[s]}
            </span>
          ),
        })),
      ]}
    />
  );
}

export function MilestoneDetailPage() {
  const { milestoneId } = useParams<{ milestoneId: string }>();
  const navigate = useNavigate();
  const { isAdmin, canWrite } = useAuth();

  const { data: milestone, isLoading } = useMilestone(milestoneId);
  const update = useUpdateMilestone();
  const replaceObjectives = useReplaceObjectives();
  const remove = useDeleteMilestone();

  if (isLoading) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed p-8">
        <Spinner />
      </div>
    );
  }
  if (!milestone) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        {t('milestones.notFound')}{' '}
        <Link to="/okrs" className="font-medium text-foreground underline-offset-4 hover:underline">
          {t('milestones.title')}
        </Link>
      </div>
    );
  }

  const objectives = milestone.objectives ?? [];

  function saveObjectives(next: Objective[]) {
    replaceObjectives.mutate({ id: milestone!.id, objectives: next });
  }
  function patchObjective(oid: string, patch: Partial<Objective>) {
    saveObjectives(objectives.map((o) => (o.id === oid ? { ...o, ...patch } : o)));
  }
  function patchKr(oid: string, kid: string, patch: Partial<KeyResult>) {
    saveObjectives(
      objectives.map((o) =>
        o.id === oid
          ? { ...o, keyResults: o.keyResults.map((k) => (k.id === kid ? { ...k, ...patch } : k)) }
          : o,
      ),
    );
  }
  /** Re-split one objective's key results, keeping everything else as it was. */
  function applyKrWeights(oid: string, weights: number[]) {
    saveObjectives(
      objectives.map((o) =>
        o.id === oid
          ? { ...o, keyResults: o.keyResults.map((k, i) => ({ ...k, weight: weights[i] })) }
          : o,
      ),
    );
  }
  function setKrWeight(oid: string, kid: string, desired: number) {
    const o = objectives.find((x) => x.id === oid);
    if (o) applyKrWeights(oid, setWeight(o.keyResults, kid, desired));
  }
  /** An explicit reset: back to an even split, and the pins come off with it. */
  function evenSplit(oid: string) {
    saveObjectives(
      objectives.map((o) => {
        if (o.id !== oid) return o;
        const w = distributeEvenly(o.keyResults.length);
        return {
          ...o,
          keyResults: o.keyResults.map((k, i) => ({ ...k, weight: w[i], locked: false })),
        };
      }),
    );
  }
  function addObjective() {
    saveObjectives([
      ...objectives,
      {
        id: crypto.randomUUID(),
        title: t('milestones.newObjective'),
        keyResults: [],
        progress: 0,
        weight: OBJECTIVE_WEIGHT,
        status: '',
        notes: '',
      },
    ]);
  }
  function removeObjective(oid: string) {
    saveObjectives(objectives.filter((o) => o.id !== oid));
  }
  // Adding or removing a key result re-splits the objective evenly rather than
  // trying to preserve a hand-tuned split around a set that just changed size.
  function addKr(oid: string) {
    saveObjectives(
      objectives.map((o) => {
        if (o.id !== oid) return o;
        const krs: KeyResult[] = [
          ...o.keyResults,
          {
            id: crypto.randomUUID(),
            title: t('milestones.newKr'),
            progress: 0,
            owner: '',
            weight: 0,
            locked: false,
            status: '',
          },
        ];
        const w = distributeEvenly(krs.length);
        return { ...o, keyResults: krs.map((k, i) => ({ ...k, weight: w[i] })) };
      }),
    );
  }
  function removeKr(oid: string, kid: string) {
    saveObjectives(
      objectives.map((o) => {
        if (o.id !== oid) return o;
        const krs = o.keyResults.filter((k) => k.id !== kid);
        const w = distributeEvenly(krs.length);
        return { ...o, keyResults: krs.map((k, i) => ({ ...k, weight: w[i] })) };
      }),
    );
  }

  return (
    <CenteredPageLayout>
      {/* No BackLink — the topbar's breadcrumb ("OKRs › this milestone") is the
          way back now. */}
      <PageHeader
        title={milestone.title}
        subtitle={milestone.timeframe || undefined}
        actions={
          <>
            {canWrite && (
              <div className="w-40">
                <Select
                  value={milestone.status}
                  onValueChange={(v) =>
                    update.mutate({ id: milestone.id, input: { status: v as MilestoneStatus } })
                  }
                  options={MILESTONE_STATUSES.map((s) => ({
                    value: s,
                    label: MILESTONE_STATUS_LABEL[s],
                  }))}
                />
              </div>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm(t('milestones.confirmDelete')))
                    remove.mutate(milestone.id, { onSuccess: () => navigate('/okrs') });
                }}
              >
                {t('milestones.delete')}
              </Button>
            )}
          </>
        }
      />

      {milestone.timeframe && (
        <p className="mb-4 text-sm text-muted-foreground">{milestone.timeframe}</p>
      )}

      <div className="mb-6 rounded-xl border bg-card p-4 text-card-foreground">
        <div className="mb-2 flex justify-between text-sm">
          <span>{t('milestones.overall')}</span>
          <strong>{milestone.progress}%</strong>
        </div>
        <ProgressBar value={milestone.progress} />
      </div>

      {objectives.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t('milestones.noObjectives')}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {objectives.map((o, oi) => (
            <div key={o.id} className="rounded-xl border bg-card p-4 text-card-foreground">
              {/* Column headers */}
              <div className="flex items-center gap-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span className="flex-1" />
                <span className={COL.status + ' text-center'}>{t('milestones.progress')}</span>
                <span className={COL.score}>{t('milestones.score')}</span>
                <span className={COL.weight + ' text-center'}>{t('milestones.weight')}</span>
                <span className={COL.record}>{t('milestones.record')}</span>
                {canWrite && <span className={COL.del} />}
              </div>

              {/* Objective row */}
              <div className="flex items-center gap-2 border-b py-2">
                <span className="grid h-6 min-w-8 shrink-0 place-items-center rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground">
                  O{oi + 1}
                </span>
                {canWrite ? (
                  <Input
                    className="flex-1 border-transparent text-[15px] font-semibold shadow-none hover:border-input"
                    defaultValue={o.title}
                    onBlur={(e) =>
                      e.target.value !== o.title && patchObjective(o.id, { title: e.target.value })
                    }
                  />
                ) : (
                  <h3 className="flex-1 text-[15px] font-semibold">{o.title}</h3>
                )}
                <div className={COL.status}>
                  <StatusChip
                    value={o.status}
                    onChange={(s) => patchObjective(o.id, { status: s })}
                    disabled={!canWrite}
                  />
                </div>
                <span className={cn(COL.score, 'text-sm font-medium tabular-nums')}>
                  {(o.progress / 10).toFixed(1)}
                </span>
                {/* Fixed, not editable: an objective always counts for all of
                    itself — the split that matters happens between its KRs. */}
                <div className={cn(COL.weight, 'flex items-center gap-1')}>
                  <span
                    className="flex-1 pr-3 text-right text-sm font-medium tabular-nums text-muted-foreground"
                    title={t('milestones.objectiveWeightHint')}
                  >
                    {OBJECTIVE_WEIGHT}%
                  </span>
                  {canWrite && <span className="size-7 shrink-0" aria-hidden />}
                </div>
                <span className={cn(COL.record, 'text-sm tabular-nums text-muted-foreground')}>0</span>
                {canWrite && (
                  <button
                    type="button"
                    className={cn(
                      COL.del,
                      'grid h-8 place-items-center rounded-md text-muted-foreground transition-colors hover:text-destructive',
                    )}
                    aria-label={t('common.delete')}
                    onClick={() => removeObjective(o.id)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>

              {/* Key result rows */}
              {o.keyResults.map((k, ki) => (
                <div key={k.id} className="flex items-center gap-2 border-b py-2 last:border-b-0">
                  <span className="ml-6 grid h-5 shrink-0 place-items-center rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
                    {krLabel(ki)}
                  </span>
                  {canWrite ? (
                    <Input
                      className="flex-1"
                      defaultValue={k.title}
                      onBlur={(e) =>
                        e.target.value !== k.title && patchKr(o.id, k.id, { title: e.target.value })
                      }
                    />
                  ) : (
                    <span className="flex-1 text-sm">{k.title}</span>
                  )}
                  <div className={COL.status}>
                    <StatusChip
                      value={k.status}
                      onChange={(s) => patchKr(o.id, k.id, { status: s })}
                      disabled={!canWrite}
                    />
                  </div>
                  <div className={COL.score}>
                    {canWrite ? (
                      <Input
                        key={`ks-${k.id}-${k.progress}`}
                        type="number"
                        min={0}
                        max={10}
                        step="0.1"
                        defaultValue={(k.progress / 10).toFixed(1)}
                        className="h-8 px-1 text-center text-sm"
                        title={t('milestones.scoreHint')}
                        onBlur={(e) => {
                          const p = Math.round(Math.max(0, Math.min(10, Number(e.target.value) || 0)) * 10);
                          p !== k.progress && patchKr(o.id, k.id, { progress: p });
                        }}
                      />
                    ) : (
                      <span className="block text-center text-sm tabular-nums">
                        {(k.progress / 10).toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className={cn(COL.weight, 'flex items-center gap-1')}>
                    {canWrite ? (
                      <>
                        <Input
                          key={`kw-${k.id}-${k.weight}`}
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={k.weight}
                          className="h-8 min-w-0 flex-1 px-2 text-right text-sm"
                          title={t('milestones.krWeightHint')}
                          onBlur={(e) => {
                            const w = clampPct(e.target.value);
                            w !== k.weight && setKrWeight(o.id, k.id, w);
                          }}
                        />
                        <button
                          type="button"
                          aria-pressed={k.locked}
                          aria-label={
                            k.locked ? t('milestones.unlockWeight') : t('milestones.lockWeight')
                          }
                          title={k.locked ? t('milestones.unlockWeight') : t('milestones.lockWeight')}
                          className={cn(
                            'grid size-7 shrink-0 place-items-center rounded-md transition-colors',
                            k.locked
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                          )}
                          onClick={() => patchKr(o.id, k.id, { locked: !k.locked })}
                        >
                          {k.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                        </button>
                      </>
                    ) : (
                      <span className="flex-1 pr-3 text-right text-sm tabular-nums">{k.weight}%</span>
                    )}
                  </div>
                  <span className={cn(COL.record, 'text-sm tabular-nums text-muted-foreground')}>0</span>
                  {canWrite && (
                    <button
                      type="button"
                      className={cn(
                        COL.del,
                        'grid h-8 place-items-center rounded-md text-muted-foreground transition-colors hover:text-destructive',
                      )}
                      aria-label={t('common.delete')}
                      onClick={() => removeKr(o.id, k.id)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}

              {/* One key result is always the whole 100% — there is no split to show. */}
              {o.keyResults.length > 1 && (
                <div className="mt-3 border-t pt-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t('milestones.weightSplit')}
                      {canWrite && (
                        <span className="ml-1.5 normal-case tracking-normal opacity-70">
                          · {t('milestones.weightSplitHint')}
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {t('milestones.weightTotal')}{' '}
                        <strong
                          className={cn(
                            'font-semibold',
                            krTotal(o) === TOTAL_WEIGHT ? 'text-foreground' : 'text-destructive',
                          )}
                        >
                          {krTotal(o)}%
                        </strong>
                      </span>
                      {canWrite && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => evenSplit(o.id)}
                        >
                          {t('milestones.distributeEvenly')}
                        </Button>
                      )}
                    </div>
                  </div>
                  <WeightSplitBar
                    items={o.keyResults}
                    disabled={!canWrite}
                    onChange={(weights) => applyKrWeights(o.id, weights)}
                  />
                </div>
              )}

              {canWrite && (
                <button
                  type="button"
                  className="mt-3 flex items-center gap-1.5 rounded-md px-1 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => addKr(o.id)}
                >
                  <Plus className="size-4" />
                  {t('milestones.addKr')}
                </button>
              )}

              {/* Notes */}
              <div className="mt-3 flex items-center gap-2 border-t pt-3 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                {canWrite ? (
                  <input
                    defaultValue={o.notes}
                    placeholder={t('milestones.notesPlaceholder')}
                    className="min-w-0 flex-1 bg-transparent text-muted-foreground outline-none placeholder:text-muted-foreground/70"
                    onBlur={(e) =>
                      e.target.value !== o.notes && patchObjective(o.id, { notes: e.target.value })
                    }
                  />
                ) : (
                  <span className="text-muted-foreground">
                    {o.notes || t('milestones.notesPlaceholder')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canWrite && (
        <button
          type="button"
          onClick={addObjective}
          className="mt-4 flex w-full items-center gap-2 rounded-xl border bg-card p-4 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
        >
          <span className="grid size-7 place-items-center rounded-full bg-muted">
            <Plus className="size-4" />
          </span>
          {t('milestones.addObjective')}
        </button>
      )}
    </CenteredPageLayout>
  );
}
