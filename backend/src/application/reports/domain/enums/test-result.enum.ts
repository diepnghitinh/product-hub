/** The six test-case results (docs/00-feature-inventory.md §4). */
export enum TestResult {
  PASSED = 'Passed',
  FAILED = 'Failed',
  BLOCKED = 'Blocked',
  RETEST = 'Retest',
  SKIPPED = 'Skipped',
  UNTESTED = 'Untested',
}

export const TEST_RESULTS: TestResult[] = [
  TestResult.PASSED,
  TestResult.FAILED,
  TestResult.BLOCKED,
  TestResult.RETEST,
  TestResult.SKIPPED,
  TestResult.UNTESTED,
];
