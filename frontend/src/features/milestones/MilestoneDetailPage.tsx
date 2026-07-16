import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button, Input, ProgressBar, Select, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { BackLink } from '@/components/BackLink';
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

// Right-hand column widths, shared by the header + objective/KR rows so they align.
const COL = {
  status: 'w-[124px] shrink-0',
  score: 'w-[52px] shrink-0 text-center',
  weight: 'w-[72px] shrink-0',
  record: 'w-[44px] shrink-0 text-center',
  del: 'w-8 shrink-0',
};

/** Even weight split that sums to 100 (remainder to the last). */
function distribute(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(100 / count);
  const arr = Array<number>(count).fill(base);
  arr[count - 1] += 100 - base * count;
  return arr;
}

const clampPct = (v: string, max = 100) => Math.max(0, Math.min(max, Number(v) || 0));

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
  function addObjective() {
    const next: Objective[] = [
      ...objectives,
      {
        id: crypto.randomUUID(),
        title: t('milestones.newObjective'),
        keyResults: [],
        progress: 0,
        weight: 0,
        status: '',
        notes: '',
      },
    ];
    const w = distribute(next.length);
    saveObjectives(next.map((o, i) => ({ ...o, weight: w[i] })));
  }
  function removeObjective(oid: string) {
    const next = objectives.filter((o) => o.id !== oid);
    const w = distribute(next.length);
    saveObjectives(next.map((o, i) => ({ ...o, weight: w[i] })));
  }
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
            status: '',
          },
        ];
        const w = distribute(krs.length);
        return { ...o, keyResults: krs.map((k, i) => ({ ...k, weight: w[i] })) };
      }),
    );
  }
  function removeKr(oid: string, kid: string) {
    saveObjectives(
      objectives.map((o) => {
        if (o.id !== oid) return o;
        const krs = o.keyResults.filter((k) => k.id !== kid);
        const w = distribute(krs.length);
        return { ...o, keyResults: krs.map((k, i) => ({ ...k, weight: w[i] })) };
      }),
    );
  }

  return (
    <div>
      <BackLink to="/okrs">{t('milestones.title')}</BackLink>

      <header className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{milestone.title}</h1>
          {milestone.timeframe && (
            <p className="mt-1 text-sm text-muted-foreground">{milestone.timeframe}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canWrite && (
            <div className="w-full sm:w-40">
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
        </div>
      </header>

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
                <div className={COL.weight}>
                  {canWrite ? (
                    <Input
                      key={`ow-${o.id}-${o.weight}`}
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={o.weight}
                      className="h-8 text-right text-sm"
                      onBlur={(e) => {
                        const w = clampPct(e.target.value);
                        w !== o.weight && patchObjective(o.id, { weight: w });
                      }}
                    />
                  ) : (
                    <span className="block text-right text-sm tabular-nums">{o.weight}%</span>
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
                    KR{ki + 1}
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
                  <div className={COL.weight}>
                    {canWrite ? (
                      <Input
                        key={`kw-${k.id}-${k.weight}`}
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={k.weight}
                        className="h-8 text-right text-sm"
                        onBlur={(e) => {
                          const w = clampPct(e.target.value);
                          w !== k.weight && patchKr(o.id, k.id, { weight: w });
                        }}
                      />
                    ) : (
                      <span className="block text-right text-sm tabular-nums">{k.weight}%</span>
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

              {canWrite && (
                <button
                  type="button"
                  className="mt-2 flex items-center gap-1.5 rounded-md px-1 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
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
    </div>
  );
}
