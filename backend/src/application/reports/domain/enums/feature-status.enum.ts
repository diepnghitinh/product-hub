/** A feature report's rollup status. Drives the project progress bar + pills. */
export enum FeatureStatus {
  TESTING = 'testing',
  DONE = 'done',
  INFO = 'info',
}

export const FEATURE_STATUSES: FeatureStatus[] = [
  FeatureStatus.TESTING,
  FeatureStatus.DONE,
  FeatureStatus.INFO,
];
