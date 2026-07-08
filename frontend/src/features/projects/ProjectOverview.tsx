import { useParams } from 'react-router-dom';
import { ProgressBar, Spinner } from '@/components/ui';
import { t } from '@/i18n';
import { FeatureStatus } from '@/types/enums';
import { useReports } from '@/features/reports/api';

/** Project index tab — live rollups computed from the feature reports. */
export function ProjectOverview() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: reports, isLoading } = useReports(projectId);

  if (isLoading) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed p-8">
        <Spinner />
      </div>
    );
  }

  const list = reports ?? [];
  const total = list.length;
  const done = list.filter((r) => r.statusVariant === FeatureStatus.DONE).length;
  const testing = list.filter((r) => r.statusVariant === FeatureStatus.TESTING).length;
  const info = list.filter((r) => r.statusVariant === FeatureStatus.INFO).length;
  const cases = list.reduce((n, r) => n + r.caseCount, 0);
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('project.overview')}
        </h2>
      </div>

      <div className="mb-6 rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span>{t('summary.completion')}</span>
          <strong>{progress}%</strong>
        </div>
        <ProgressBar value={progress} />
      </div>

      <div className="mb-6 mt-4 flex flex-wrap gap-6">
        <div className="flex flex-col gap-0.5">
          <span className="text-2xl font-semibold tracking-tight">{total}</span>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('projects.reports')}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-2xl font-semibold tracking-tight text-success">{done}</span>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('projects.done')}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-2xl font-semibold tracking-tight text-warning">{testing}</span>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('projects.testing')}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-2xl font-semibold tracking-tight text-muted-foreground">
            {info}
          </span>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('projects.info')}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-2xl font-semibold tracking-tight">{cases}</span>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('summary.cases')}
          </span>
        </div>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">{t('project.selectFeature')}</p>
    </div>
  );
}
