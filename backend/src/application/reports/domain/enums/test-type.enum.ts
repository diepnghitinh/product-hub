/** The ten test types (docs/00-feature-inventory.md §4). */
export enum TestType {
  FUNCTIONAL = 'Functional',
  UI = 'UI',
  UX = 'UX',
  API = 'API',
  INTEGRATION = 'Integration',
  PERFORMANCE = 'Performance',
  SECURITY = 'Security',
  REGRESSION = 'Regression',
  ACCESSIBILITY = 'Accessibility',
  OTHER = 'Other',
}

export const TEST_TYPES: TestType[] = [
  TestType.FUNCTIONAL,
  TestType.UI,
  TestType.UX,
  TestType.API,
  TestType.INTEGRATION,
  TestType.PERFORMANCE,
  TestType.SECURITY,
  TestType.REGRESSION,
  TestType.ACCESSIBILITY,
  TestType.OTHER,
];
