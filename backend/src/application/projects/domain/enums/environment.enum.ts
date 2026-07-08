/**
 * Deployment environment a project targets. Surfaced as a badge on the Dashboard
 * card. Mirrors product-os `environment` (docs/00-feature-inventory.md §4).
 */
export enum Environment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
}

export const ENVIRONMENTS: Environment[] = [
  Environment.DEVELOPMENT,
  Environment.STAGING,
  Environment.PRODUCTION,
];
