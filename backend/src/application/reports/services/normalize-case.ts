import { TestResult } from '../domain/enums/test-result.enum';
import { TestType } from '../domain/enums/test-type.enum';
import { TestCaseData } from '../domain/types/section.types';
import { RawTestCaseInput } from '../dtos/import-test-cases.dto';

const TYPE_ALIASES: Record<string, TestType> = {
  function: TestType.FUNCTIONAL,
  functional: TestType.FUNCTIONAL,
  feature: TestType.FUNCTIONAL,
  ui: TestType.UI,
  ux: TestType.UX,
  'ui/ux': TestType.UX,
  'ux/ui': TestType.UX,
  'user experience': TestType.UX,
  api: TestType.API,
  integration: TestType.INTEGRATION,
  e2e: TestType.INTEGRATION,
  'end-to-end': TestType.INTEGRATION,
  performance: TestType.PERFORMANCE,
  perf: TestType.PERFORMANCE,
  load: TestType.PERFORMANCE,
  stress: TestType.PERFORMANCE,
  security: TestType.SECURITY,
  regression: TestType.REGRESSION,
  smoke: TestType.REGRESSION,
  accessibility: TestType.ACCESSIBILITY,
  a11y: TestType.ACCESSIBILITY,
  other: TestType.OTHER,
};

const RESULT_ALIASES: Record<string, TestResult> = {
  pass: TestResult.PASSED,
  passed: TestResult.PASSED,
  ok: TestResult.PASSED,
  success: TestResult.PASSED,
  done: TestResult.PASSED,
  fail: TestResult.FAILED,
  failed: TestResult.FAILED,
  blocked: TestResult.BLOCKED,
  block: TestResult.BLOCKED,
  retest: TestResult.RETEST,
  reopen: TestResult.RETEST,
  skipped: TestResult.SKIPPED,
  skip: TestResult.SKIPPED,
  na: TestResult.SKIPPED,
  'n/a': TestResult.SKIPPED,
  untested: TestResult.UNTESTED,
  pending: TestResult.UNTESTED,
  todo: TestResult.UNTESTED,
  wip: TestResult.UNTESTED,
  'in progress': TestResult.UNTESTED,
};

function normalizeType(raw?: string): TestType | '' {
  if (!raw) return '';
  return TYPE_ALIASES[raw.trim().toLowerCase()] ?? '';
}

function normalizeResult(raw?: string): TestResult {
  if (!raw) return TestResult.UNTESTED;
  return RESULT_ALIASES[raw.trim().toLowerCase()] ?? TestResult.UNTESTED;
}

function toSteps(steps?: string[] | string): string[] {
  if (!steps) return [];
  if (Array.isArray(steps)) return steps.filter(Boolean);
  return steps
    .split(/\r?\n|\||(?:\d+\.\s+)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Normalize a raw import row into a case (minus the ids the entity mints). */
export function normalizeCase(
  raw: RawTestCaseInput,
): Omit<TestCaseData, 'id' | 'shortId'> {
  return {
    area: (raw.area ?? '').toString().trim(),
    type: normalizeType(raw.type),
    result: normalizeResult(raw.result),
    owner: (raw.owner ?? '').toString().trim(),
    precondition: raw.precondition?.toString().trim() || undefined,
    testSteps: toSteps(raw.testSteps),
    expectedResult: raw.expectedResult?.toString().trim() || undefined,
    actualResult: raw.actualResult?.toString().trim() || undefined,
    note: raw.note?.toString().trim() || undefined,
  };
}

/** Normalize a batch, skipping fully-empty rows. Returns cases + skipped count. */
export function normalizeCases(rows: RawTestCaseInput[]): {
  cases: Omit<TestCaseData, 'id' | 'shortId'>[];
  skipped: number;
} {
  const cases: Omit<TestCaseData, 'id' | 'shortId'>[] = [];
  let skipped = 0;
  for (const row of rows) {
    const c = normalizeCase(row);
    const empty =
      !c.area &&
      !c.owner &&
      !c.precondition &&
      (!c.testSteps || c.testSteps.length === 0) &&
      !c.expectedResult &&
      !c.actualResult &&
      !c.note;
    if (empty) {
      skipped += 1;
      continue;
    }
    cases.push(c);
  }
  return { cases, skipped };
}
