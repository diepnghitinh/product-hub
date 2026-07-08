import { Link, useParams } from 'react-router-dom';
import {
  ProgressBar,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { t } from '@/i18n';
import {
  FEATURE_STATUS_COLOR,
  FEATURE_STATUS_LABEL,
  FeatureStatus,
} from '@/types/enums';
import { useGroups } from '@/features/groups/api';
import { useReports } from '@/features/reports/api';

/** Project-wide feature rollup table (the "executive summary" tab). */
export function FeatureSummary() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: reports, isLoading } = useReports(projectId);
  const { data: groups } = useGroups(projectId);

  if (isLoading) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed p-8">
        <Spinner />
      </div>
    );
  }

  const list = reports ?? [];
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.title]));
  const total = list.length;
  const done = list.filter((r) => r.statusVariant === FeatureStatus.DONE).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('summary.title')}
        </h2>
      </div>

      <div className="mb-6 rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span>
            {done} / {total} {t('projects.done')}
          </span>
          <strong>{progress}%</strong>
        </div>
        <ProgressBar value={progress} />
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t('project.noFeatures')}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('summary.feature')}</TableHead>
                <TableHead>{t('summary.group')}</TableHead>
                <TableHead>{t('summary.status')}</TableHead>
                <TableHead>{t('summary.cases')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link
                      to={`/projects/${projectId}/reports/${r.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {r.label || r.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {groupName.get(r.groupId) ?? '—'}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: FEATURE_STATUS_COLOR[r.statusVariant] }}
                      />
                      {FEATURE_STATUS_LABEL[r.statusVariant]}
                    </span>
                  </TableCell>
                  <TableCell>{r.caseCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
