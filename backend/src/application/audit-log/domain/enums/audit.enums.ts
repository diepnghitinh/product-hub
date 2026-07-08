/** What kind of thing changed. */
export enum AuditEntity {
  TESTCASE = 'testcase',
  REPORT = 'report',
}

/** Who made the change — an authenticated user or a public API key. */
export enum AuditActor {
  USER = 'user',
  API = 'api',
}
