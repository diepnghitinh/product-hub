import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button, Input, ProgressBar, Select, Spinner } from '@/components/ui';
import { t } from '@/i18n';
import { BackLink } from '@/components/BackLink';
import {
  MILESTONE_STATUS_LABEL,
  MILESTONE_STATUSES,
  MilestoneStatus,
  Role,
} from '@/types/enums';
import type { KeyResult, Objective } from '@/types/dto';
import { useDeleteMilestone, useMilestone, useReplaceObjectives, useUpdateMilestone } from './api';

export function MilestoneDetailPage() {
  const { milestoneId } = useParams<{ milestoneId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = user?.role === Role.ADMIN || user?.role === Role.TESTER;
  const isAdmin = user?.role === Role.ADMIN;

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
        <Link
          to="/milestones"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
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
    saveObjectives([
      ...objectives,
      { id: crypto.randomUUID(), title: 'New objective', keyResults: [], progress: 0 },
    ]);
  }
  function addKr(oid: string) {
    saveObjectives(
      objectives.map((o) =>
        o.id === oid
          ? {
              ...o,
              keyResults: [
                ...o.keyResults,
                { id: crypto.randomUUID(), title: 'New key result', progress: 0, owner: '' },
              ],
            }
          : o,
      ),
    );
  }
  function removeObjective(oid: string) {
    saveObjectives(objectives.filter((o) => o.id !== oid));
  }
  function removeKr(oid: string, kid: string) {
    saveObjectives(
      objectives.map((o) =>
        o.id === oid ? { ...o, keyResults: o.keyResults.filter((k) => k.id !== kid) } : o,
      ),
    );
  }

  return (
    <div>
      <BackLink to="/milestones">{t('milestones.title')}</BackLink>

      <header className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{milestone.title}</h1>
          {milestone.timeframe && (
            <p className="mt-1 text-sm text-muted-foreground">{milestone.timeframe}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canWrite && (
            <div className="w-full sm:w-44">
              <Select
                value={milestone.status}
                onChange={(e) =>
                  update.mutate({ id: milestone.id, input: { status: e.target.value as MilestoneStatus } })
                }
              >
                {MILESTONE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {MILESTONE_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm(t('milestones.confirmDelete')))
                  remove.mutate(milestone.id, { onSuccess: () => navigate('/milestones') });
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
          {objectives.map((o) => (
            <div key={o.id} className="rounded-xl border bg-card p-4 text-card-foreground">
              <div className="mb-3 flex items-center gap-3">
                {canWrite ? (
                  <Input
                    className="flex-1 border-transparent text-[15px] font-semibold shadow-none hover:border-input"
                    defaultValue={o.title}
                    onBlur={(e) => e.target.value !== o.title && patchObjective(o.id, { title: e.target.value })}
                  />
                ) : (
                  <h3 className="flex-1 text-[15px] font-semibold">{o.title}</h3>
                )}
                <span className="text-sm font-semibold">{o.progress}%</span>
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-lg leading-none text-muted-foreground"
                    aria-label="Remove objective"
                    onClick={() => removeObjective(o.id)}
                  >
                    ×
                  </Button>
                )}
              </div>
              <ProgressBar value={o.progress} />

              <div className="my-3 flex flex-col gap-2">
                {o.keyResults.map((k) => (
                  <div key={k.id} className="flex items-center gap-3">
                    {canWrite ? (
                      <Input
                        className="flex-1"
                        defaultValue={k.title}
                        onBlur={(e) => e.target.value !== k.title && patchKr(o.id, k.id, { title: e.target.value })}
                      />
                    ) : (
                      <span className="flex-1 text-sm">{k.title}</span>
                    )}
                    <div className="shrink-0 text-sm">
                      {canWrite ? (
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={k.progress}
                          className="w-[70px]"
                          onBlur={(e) =>
                            Number(e.target.value) !== k.progress &&
                            patchKr(o.id, k.id, { progress: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
                          }
                        />
                      ) : (
                        <span>{k.progress}%</span>
                      )}
                    </div>
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-lg leading-none text-muted-foreground"
                        aria-label="Remove key result"
                        onClick={() => removeKr(o.id, k.id)}
                      >
                        ×
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {canWrite && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={() => addKr(o.id)}
                >
                  + {t('milestones.addKr')}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {canWrite && (
        <div className="mt-6 border-t border-dashed pt-4">
          <Button variant="secondary" size="sm" onClick={addObjective}>
            + {t('milestones.addObjective')}
          </Button>
        </div>
      )}
    </div>
  );
}
