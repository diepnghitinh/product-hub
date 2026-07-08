import { t } from '@/i18n';
import {
  SectionType,
  TEST_RESULT_COLOR,
  TestResult,
} from '@/types/enums';
import type { ReportSection } from '@/types/dto';

/**
 * At-a-glance test-result summary for a report — an "executive" KPI strip:
 * overall pass rate + a breakdown of result counts. Renders nothing until the
 * report actually has test cases, so info-only features stay clean.
 */
export function ReportStats({ sections }: { sections: ReportSection[] }) {
  const cases = sections.flatMap((s) =>
    s.type === SectionType.TESTING ? s.cases ?? [] : [],
  );
  const total = cases.length;
  if (total === 0) return null;

  const count = (r: TestResult) => cases.filter((c) => c.result === r).length;
  const passed = count(TestResult.PASSED);
  const passRate = Math.round((passed / total) * 100);

  const tiles: { label: string; value: number; color: string }[] = [
    { label: TestResult.PASSED, value: passed, color: TEST_RESULT_COLOR[TestResult.PASSED] },
    { label: TestResult.FAILED, value: count(TestResult.FAILED), color: TEST_RESULT_COLOR[TestResult.FAILED] },
    { label: TestResult.BLOCKED, value: count(TestResult.BLOCKED), color: TEST_RESULT_COLOR[TestResult.BLOCKED] },
    { label: TestResult.UNTESTED, value: count(TestResult.UNTESTED), color: TEST_RESULT_COLOR[TestResult.UNTESTED] },
  ];
  const passColor = TEST_RESULT_COLOR[TestResult.PASSED];

  return (
    <section
      aria-label={t('report.statSummary')}
      className="rounded-xl border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Pass rate */}
        <div className="sm:w-44 sm:shrink-0">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums" style={{ color: passColor }}>
              {passRate}%
            </span>
            <span className="text-xs text-muted-foreground">{t('report.statPassRate')}</span>
          </div>
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={passRate}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${passRate}%`, background: passColor }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {passed} / {total} {t('report.statPassed')}
          </p>
        </div>

        <div className="hidden w-px self-stretch bg-border sm:block" />

        {/* Result breakdown */}
        <dl className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{tile.label}</dt>
              <dd className="text-xl font-semibold tabular-nums" style={{ color: tile.color }}>
                {tile.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
