import { Link, useParams } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import {
  FEATURE_STATUS_LABEL,
  FeatureStatus,
  SectionType,
  TEST_RESULTS,
  TestResult,
} from '@/types/enums';
import type { ReportDto, TestingSection } from '@/types/dto';
import { useProject } from './api';
import { useGroups } from '@/features/groups/api';
import { useReports } from '@/features/reports/api';

/** Result → workspace-token colour (valid inside .report-workspace). */
const RESULT_COLOR: Record<TestResult, string> = {
  [TestResult.PASSED]: 'var(--success)',
  [TestResult.FAILED]: 'var(--danger)',
  [TestResult.BLOCKED]: 'var(--warning)',
  [TestResult.RETEST]: 'var(--info)',
  [TestResult.SKIPPED]: 'var(--muted)',
  [TestResult.UNTESTED]: 'var(--border-strong)',
};
const RESULT_CLASS: Record<TestResult, string> = {
  [TestResult.PASSED]: 'result-passed',
  [TestResult.FAILED]: 'result-failed',
  [TestResult.BLOCKED]: 'result-blocked',
  [TestResult.RETEST]: 'result-retest',
  [TestResult.SKIPPED]: 'result-skipped',
  [TestResult.UNTESTED]: 'result-untested',
};
const STATUS_ORDER = [FeatureStatus.DONE, FeatureStatus.TESTING, FeatureStatus.INFO];
const STATUS_BADGE: Record<FeatureStatus, string> = {
  [FeatureStatus.DONE]: 'badge badge-success',
  [FeatureStatus.TESTING]: 'badge badge-warning',
  [FeatureStatus.INFO]: 'badge badge-info',
};

function ResultDonut({ total, byResult }: { total: number; byResult: Record<TestResult, number> }) {
  const size = 180;
  const strokeWidth = 28;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const c = size / 2;
  const segments: { result: TestResult; length: number; offset: number }[] = [];
  let cursor = 0;
  for (const r of TEST_RESULTS) {
    const count = byResult[r] ?? 0;
    if (count === 0) continue;
    const length = (count / total) * circumference;
    segments.push({ result: r, length, offset: cursor });
    cursor += length;
  }
  return (
    <div className="result-donut">
      <svg
        className="result-donut-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Test case results: ${total} total`}
      >
        <circle cx={c} cy={c} r={radius} fill="transparent" stroke="var(--bg-subtle)" strokeWidth={strokeWidth} />
        <g transform={`rotate(-90 ${c} ${c})`}>
          {segments.map((s) => (
            <circle
              key={s.result}
              cx={c}
              cy={c}
              r={radius}
              fill="transparent"
              stroke={RESULT_COLOR[s.result]}
              strokeWidth={strokeWidth}
              strokeDasharray={`${s.length} ${circumference - s.length}`}
              strokeDashoffset={-s.offset}
            />
          ))}
        </g>
      </svg>
      <div className="result-donut-center">
        <span className="result-donut-value">{total}</span>
        <span className="result-donut-label">{total === 1 ? 'case' : 'cases'}</span>
      </div>
    </div>
  );
}

function calcStats(reports: ReportDto[]) {
  const statusCounts: Record<FeatureStatus, number> = {
    [FeatureStatus.DONE]: 0,
    [FeatureStatus.TESTING]: 0,
    [FeatureStatus.INFO]: 0,
  };
  const caseByResult = {
    [TestResult.PASSED]: 0,
    [TestResult.FAILED]: 0,
    [TestResult.BLOCKED]: 0,
    [TestResult.RETEST]: 0,
    [TestResult.SKIPPED]: 0,
    [TestResult.UNTESTED]: 0,
  } as Record<TestResult, number>;
  const coverageValues: number[] = [];
  let resultTotal = 0;
  for (const report of reports) {
    statusCounts[report.statusVariant] = (statusCounts[report.statusVariant] ?? 0) + 1;
    for (const section of report.sections ?? []) {
      if (section.type !== SectionType.TESTING) continue;
      const ts = section as TestingSection;
      for (const cse of ts.cases ?? []) {
        resultTotal += 1;
        if (caseByResult[cse.result] !== undefined) caseByResult[cse.result] += 1;
      }
      for (const cov of ts.coverage ?? []) {
        const pct = Number(cov.percent);
        if (Number.isFinite(pct)) coverageValues.push(Math.max(0, Math.min(100, pct)));
      }
    }
  }
  // Fall back to the per-report rollup count when the list omits full sections.
  const caseTotal = resultTotal || reports.reduce((n, r) => n + (r.caseCount ?? 0), 0);
  const coverageAvg = coverageValues.length
    ? coverageValues.reduce((a, b) => a + b, 0) / coverageValues.length
    : 0;
  return { reportCount: reports.length, statusCounts, caseTotal, resultTotal, caseByResult, coverageValues, coverageAvg };
}

/** Unified project "Overview" tab — meta + coverage rollup + status totals + features by group. */
export function FeatureSummary() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project } = useProject(projectId);
  const { data: reports, isLoading } = useReports(projectId);
  const { data: groups } = useGroups(projectId);

  if (isLoading || !project) {
    return (
      <div className="feature-summary" style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
        <Spinner />
      </div>
    );
  }

  const list = reports ?? [];
  const groupList = groups ?? [];
  const stats = calcStats(list);
  const generated = new Date().toISOString().slice(0, 10);

  const knownGroupIds = new Set(groupList.map((g) => g.id));
  const ungrouped = list.filter((r) => !knownGroupIds.has(r.groupId));
  const sections: { id: string; title: string; items: ReportDto[] }[] = [
    ...groupList.map((g) => ({ id: g.id, title: g.title, items: list.filter((r) => r.groupId === g.id) })),
    ...(ungrouped.length ? [{ id: '__ungrouped', title: 'Ungrouped', items: ungrouped }] : []),
  ];

  return (
    <article className="feature-summary">
      <header className="feature-summary-header">
        <div className="feature-summary-header-top">
          <span className="feature-summary-eyebrow">Feature Summary</span>
          <h1>{project.title}</h1>
          {project.subtitle && <p className="feature-summary-subtitle">{project.subtitle}</p>}
        </div>
        <dl className="feature-summary-meta">
          <div>
            <dt>Owner</dt>
            <dd>{project.owner || '—'}</dd>
          </div>
          <div>
            <dt>Generated</dt>
            <dd>{generated}</dd>
          </div>
          <div>
            <dt>Features</dt>
            <dd>{stats.reportCount}</dd>
          </div>
          <div>
            <dt>Groups</dt>
            <dd>{groupList.length}</dd>
          </div>
        </dl>
      </header>

      <section className="feature-summary-section">
        <h2 className="feature-summary-section-title">Test coverage rollup</h2>
        {stats.caseTotal === 0 && stats.coverageValues.length === 0 ? (
          <p className="feature-summary-empty">
            No testing sections yet — add a Testing section to a feature to see test data here.
          </p>
        ) : (
          <div className="feature-summary-rollup">
            <div className="feature-summary-rollup-stats">
              <div className="rollup-stat">
                <span className="rollup-stat-label">Test cases</span>
                <span className="rollup-stat-value">{stats.caseTotal}</span>
              </div>
              <div className="rollup-stat">
                <span className="rollup-stat-label">Avg coverage</span>
                <span className="rollup-stat-value">{stats.coverageAvg.toFixed(1)}%</span>
                <span className="rollup-stat-sub">
                  across {stats.coverageValues.length} item{stats.coverageValues.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            {stats.resultTotal > 0 && (
              <div className="feature-summary-rollup-chart">
                <ResultDonut total={stats.resultTotal} byResult={stats.caseByResult} />
                <div className="feature-summary-rollup-results">
                  {TEST_RESULTS.map((r) => {
                    const count = stats.caseByResult[r] ?? 0;
                    const pct = stats.resultTotal ? Math.round((count / stats.resultTotal) * 100) : 0;
                    return (
                      <div key={r} className={`rollup-result ${RESULT_CLASS[r]}`}>
                        <span className="rollup-result-label">{r}</span>
                        <span className="rollup-result-bar">
                          <span className="rollup-result-fill" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="rollup-result-count">
                          {count}
                          <span className="rollup-result-pct">{pct}%</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="feature-summary-section">
        <h2 className="feature-summary-section-title">Status totals</h2>
        <div className="feature-summary-tiles">
          {STATUS_ORDER.map((s) => {
            const count = stats.statusCounts[s] ?? 0;
            const pct = stats.reportCount ? Math.round((count / stats.reportCount) * 100) : 0;
            return (
              <div key={s} className={`feature-summary-tile tile-${s}`}>
                <span className="feature-summary-tile-count">{count}</span>
                <span className="feature-summary-tile-label">{FEATURE_STATUS_LABEL[s]}</span>
                <span className="feature-summary-tile-pct">{pct}% of features</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="feature-summary-section">
        <h2 className="feature-summary-section-title">Features by group</h2>
        {sections.length === 0 ? (
          <p className="feature-summary-empty">No groups yet.</p>
        ) : (
          <div className="feature-summary-groups">
            {sections.map((group) => (
              <div key={group.id} className="feature-summary-group">
                <header className="feature-summary-group-head">
                  <h3>{group.title}</h3>
                  <span className="feature-summary-group-count">
                    {group.items.length} {group.items.length === 1 ? 'feature' : 'features'}
                  </span>
                </header>
                {group.items.length === 0 ? (
                  <p className="feature-summary-empty">No features in this group.</p>
                ) : (
                  <table className="feature-summary-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Feature</th>
                        <th>Status</th>
                        <th>Reported</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((r) => (
                        <tr key={r.id}>
                          <td className="cell-id">{r.featureId || '—'}</td>
                          <td>
                            <Link className="feature-summary-link" to={`/testing/${projectId}/reports/${r.id}`}>
                              {r.label || r.title}
                            </Link>
                            {r.subtitle && <span className="feature-summary-subtle">{r.subtitle}</span>}
                          </td>
                          <td>
                            <span className={STATUS_BADGE[r.statusVariant]}>
                              {FEATURE_STATUS_LABEL[r.statusVariant]}
                            </span>
                          </td>
                          <td className="cell-muted">{r.reported ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </article>
  );
}
