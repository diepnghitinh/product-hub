/*
 * Shared enums — mirror the backend's `@core/interfaces` + domain enums exactly.
 * Reuse these everywhere; do not redeclare literal unions inline.
 * Source of truth: ../../docs/00-feature-inventory.md §4.
 */

export enum Role {
  ADMIN = 'admin',
  TESTER = 'tester',
  GUEST = 'guest',
}

export enum ProjectEnvironment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
}

export enum FeatureStatus {
  TESTING = 'testing',
  DONE = 'done',
  INFO = 'info',
}

export enum SectionType {
  OVERVIEW = 'overview',
  SCREENSHOT = 'screenshot',
  CARDS = 'cards',
  STEPS = 'steps',
  BULLETS = 'bullets',
  ORDERED = 'ordered',
  TESTING = 'testing',
}

export enum AuditEntityType {
  TESTCASE = 'testcase',
  REPORT = 'report',
}

export enum AuditActorType {
  USER = 'user',
  API = 'api',
}

export enum TestResult {
  PASSED = 'Passed',
  FAILED = 'Failed',
  BLOCKED = 'Blocked',
  RETEST = 'Retest',
  SKIPPED = 'Skipped',
  UNTESTED = 'Untested',
}

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

export enum BugSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum BugStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in-progress',
  BLOCKED = 'blocked',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum InboxKind {
  MENTION = 'mention',
  ASSIGNED_BUG = 'assigned-bug',
}

export enum WebhookEvent {
  BUG_CREATED = 'bug-created',
  BUG_ASSIGNED = 'bug-assigned',
  COMMENT_MENTION = 'comment-mention',
}

export enum RoadmapPhase {
  NOW = 'now',
  NEXT = 'next',
  LATER = 'later',
  DONE = 'done',
}

export enum RoadmapItemStatus {
  IDEA = 'idea',
  PLANNED = 'planned',
  IN_PROGRESS = 'in-progress',
  DONE = 'done',
}

export enum RoadmapDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

export enum MilestoneStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

export enum IndividualStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in-progress',
  DONE = 'done',
}

export const ROLE_LABEL: Record<Role, string> = {
  [Role.ADMIN]: 'Admin',
  [Role.TESTER]: 'Tester',
  [Role.GUEST]: 'Guest',
};

export const ENVIRONMENT_LABEL: Record<ProjectEnvironment, string> = {
  [ProjectEnvironment.DEVELOPMENT]: 'Development',
  [ProjectEnvironment.STAGING]: 'Staging',
  [ProjectEnvironment.PRODUCTION]: 'Production',
};

export const FEATURE_STATUS_LABEL: Record<FeatureStatus, string> = {
  [FeatureStatus.TESTING]: 'Testing',
  [FeatureStatus.DONE]: 'Done',
  [FeatureStatus.INFO]: 'Info',
};

/** Semantic color per feature status (shadcn theme tokens). */
export const FEATURE_STATUS_COLOR: Record<FeatureStatus, string> = {
  [FeatureStatus.TESTING]: 'hsl(var(--warning))',
  [FeatureStatus.DONE]: 'hsl(var(--success))',
  [FeatureStatus.INFO]: 'hsl(var(--muted-foreground))',
};

export const TEST_RESULTS: TestResult[] = [
  TestResult.PASSED,
  TestResult.FAILED,
  TestResult.BLOCKED,
  TestResult.RETEST,
  TestResult.SKIPPED,
  TestResult.UNTESTED,
];

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

/** Categorical color per test type — drives the colored Type pill. */
export const TEST_TYPE_COLOR: Record<TestType, string> = {
  [TestType.FUNCTIONAL]: 'hsl(262 60% 58%)',
  [TestType.UI]: 'hsl(212 72% 52%)',
  [TestType.UX]: 'hsl(330 68% 56%)',
  [TestType.API]: 'hsl(180 52% 40%)',
  [TestType.INTEGRATION]: 'hsl(248 52% 60%)',
  [TestType.PERFORMANCE]: 'hsl(35 85% 50%)',
  [TestType.SECURITY]: 'hsl(0 70% 58%)',
  [TestType.REGRESSION]: 'hsl(18 80% 54%)',
  [TestType.ACCESSIBILITY]: 'hsl(150 55% 40%)',
  [TestType.OTHER]: 'hsl(220 9% 50%)',
};

/** Result → semantic color (for the testing table pills). */
export const TEST_RESULT_COLOR: Record<TestResult, string> = {
  [TestResult.PASSED]: 'hsl(var(--success))',
  [TestResult.FAILED]: 'hsl(var(--destructive))',
  [TestResult.BLOCKED]: 'hsl(var(--warning))',
  [TestResult.RETEST]: 'hsl(var(--info))',
  [TestResult.SKIPPED]: 'hsl(var(--muted-foreground))',
  [TestResult.UNTESTED]: 'hsl(var(--muted-foreground))',
};

export const SECTION_TYPE_LABEL: Record<SectionType, string> = {
  [SectionType.OVERVIEW]: 'Overview',
  [SectionType.SCREENSHOT]: 'Screenshots',
  [SectionType.CARDS]: 'Cards',
  [SectionType.STEPS]: 'Steps',
  [SectionType.BULLETS]: 'Bullet list',
  [SectionType.ORDERED]: 'Numbered list',
  [SectionType.TESTING]: 'Testing',
};

/** Accent color per section type — the colored bars in the "Add section" menu. */
export const SECTION_TYPE_COLOR: Record<SectionType, string> = {
  [SectionType.OVERVIEW]: 'hsl(262 60% 58%)',
  [SectionType.SCREENSHOT]: 'hsl(212 72% 52%)',
  [SectionType.CARDS]: 'hsl(150 55% 40%)',
  [SectionType.STEPS]: 'hsl(28 80% 45%)',
  [SectionType.BULLETS]: 'hsl(220 9% 50%)',
  [SectionType.ORDERED]: 'hsl(248 60% 60%)',
  [SectionType.TESTING]: 'hsl(0 72% 50%)',
};

export const BUG_SEVERITIES: BugSeverity[] = [
  BugSeverity.LOW,
  BugSeverity.MEDIUM,
  BugSeverity.HIGH,
  BugSeverity.CRITICAL,
];

export const BUG_SEVERITY_LABEL: Record<BugSeverity, string> = {
  [BugSeverity.LOW]: 'Low',
  [BugSeverity.MEDIUM]: 'Medium',
  [BugSeverity.HIGH]: 'High',
  [BugSeverity.CRITICAL]: 'Critical',
};

export const BUG_SEVERITY_COLOR: Record<BugSeverity, string> = {
  [BugSeverity.LOW]: 'hsl(var(--muted-foreground))',
  [BugSeverity.MEDIUM]: 'hsl(var(--info))',
  [BugSeverity.HIGH]: 'hsl(var(--warning))',
  [BugSeverity.CRITICAL]: 'hsl(var(--destructive))',
};

/** Board columns, in order. */
export const BUG_STATUSES: BugStatus[] = [
  BugStatus.OPEN,
  BugStatus.IN_PROGRESS,
  BugStatus.BLOCKED,
  BugStatus.RESOLVED,
  BugStatus.CLOSED,
];

export const BUG_STATUS_LABEL: Record<BugStatus, string> = {
  [BugStatus.OPEN]: 'Open',
  [BugStatus.IN_PROGRESS]: 'In progress',
  [BugStatus.BLOCKED]: 'Blocked',
  [BugStatus.RESOLVED]: 'Resolved',
  [BugStatus.CLOSED]: 'Closed',
};

/** A tenant-configurable bug board column. `key` is the fixed workflow value;
 * `label`, `color` and order are admin-editable (see AdminSettingsPage). */
export interface BugStatusConfig {
  key: BugStatus;
  label: string;
  color: string;
}

export const DEFAULT_BUG_STATUS_COLOR: Record<BugStatus, string> = {
  [BugStatus.OPEN]: '#6b7280',
  [BugStatus.IN_PROGRESS]: '#2563eb',
  [BugStatus.BLOCKED]: '#dc2626',
  [BugStatus.RESOLVED]: '#16a34a',
  [BugStatus.CLOSED]: '#4b5563',
};

/** Client fallback until the tenant's board columns load (mirrors the backend). */
export const DEFAULT_BUG_STATUSES: BugStatusConfig[] = BUG_STATUSES.map((key) => ({
  key,
  label: BUG_STATUS_LABEL[key],
  color: DEFAULT_BUG_STATUS_COLOR[key],
}));

export const INBOX_KIND_LABEL: Record<InboxKind, string> = {
  [InboxKind.MENTION]: 'Mention',
  [InboxKind.ASSIGNED_BUG]: 'Assigned',
};

export const ROADMAP_PHASES: RoadmapPhase[] = [
  RoadmapPhase.NOW,
  RoadmapPhase.NEXT,
  RoadmapPhase.LATER,
  RoadmapPhase.DONE,
];

export const ROADMAP_PHASE_LABEL: Record<RoadmapPhase, string> = {
  [RoadmapPhase.NOW]: 'Now',
  [RoadmapPhase.NEXT]: 'Next',
  [RoadmapPhase.LATER]: 'Later',
  [RoadmapPhase.DONE]: 'Done',
};

export const ROADMAP_ITEM_STATUSES: RoadmapItemStatus[] = [
  RoadmapItemStatus.IDEA,
  RoadmapItemStatus.PLANNED,
  RoadmapItemStatus.IN_PROGRESS,
  RoadmapItemStatus.DONE,
];

export const ROADMAP_ITEM_STATUS_LABEL: Record<RoadmapItemStatus, string> = {
  [RoadmapItemStatus.IDEA]: 'Idea',
  [RoadmapItemStatus.PLANNED]: 'Planned',
  [RoadmapItemStatus.IN_PROGRESS]: 'In progress',
  [RoadmapItemStatus.DONE]: 'Done',
};

export const ROADMAP_DIFFICULTIES: RoadmapDifficulty[] = [
  RoadmapDifficulty.EASY,
  RoadmapDifficulty.MEDIUM,
  RoadmapDifficulty.HARD,
];

export const ROADMAP_DIFFICULTY_LABEL: Record<RoadmapDifficulty, string> = {
  [RoadmapDifficulty.EASY]: 'Easy',
  [RoadmapDifficulty.MEDIUM]: 'Medium',
  [RoadmapDifficulty.HARD]: 'Hard',
};

export const MILESTONE_STATUSES: MilestoneStatus[] = [
  MilestoneStatus.ACTIVE,
  MilestoneStatus.COMPLETED,
  MilestoneStatus.ARCHIVED,
];

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  [MilestoneStatus.ACTIVE]: 'Active',
  [MilestoneStatus.COMPLETED]: 'Completed',
  [MilestoneStatus.ARCHIVED]: 'Archived',
};

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  WebhookEvent.BUG_CREATED,
  WebhookEvent.BUG_ASSIGNED,
  WebhookEvent.COMMENT_MENTION,
];

export const WEBHOOK_EVENT_LABEL: Record<WebhookEvent, string> = {
  [WebhookEvent.BUG_CREATED]: 'Bug created',
  [WebhookEvent.BUG_ASSIGNED]: 'Bug assigned',
  [WebhookEvent.COMMENT_MENTION]: 'Comment mention',
};
