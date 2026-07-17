/*
 * Shared enums — mirror the backend's `@core/interfaces` + domain enums exactly.
 * Reuse these everywhere; do not redeclare literal unions inline.
 * Source of truth: ../../docs/00-feature-inventory.md §4.
 */

export enum Role {
  ADMIN = 'admin',
  TESTER = 'tester',
  GUEST = 'guest',
  /** Product manager — full Delivery + project management, and create/edit
   *  (not delete) of Roadmaps & OKRs. */
  PRODUCT = 'product',
  /** Developer — maintain Delivery work items (test cases, bugs, tasks) only. */
  DEVELOPER = 'developer',
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

/**
 * Task workflow status — the checkable state of a piece of engineering work.
 * (Repurposed from the former orphan `IndividualStatus`; identical values.)
 * Mirrors the backend `TaskStatus` enum exactly.
 */
export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in-progress',
  DONE = 'done',
}

export const ROLE_LABEL: Record<Role, string> = {
  [Role.ADMIN]: 'Admin',
  [Role.TESTER]: 'Tester',
  [Role.GUEST]: 'Guest',
  [Role.PRODUCT]: 'Product',
  [Role.DEVELOPER]: 'Developer',
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

/** Column accent per phase (shadcn theme tokens — no new brand colors).
 * Now = brand focus, Next = amber, Later = muted, Done = green. */
export const ROADMAP_PHASE_COLOR: Record<RoadmapPhase, string> = {
  [RoadmapPhase.NOW]: 'hsl(var(--primary))',
  [RoadmapPhase.NEXT]: 'hsl(var(--warning))',
  [RoadmapPhase.LATER]: 'hsl(var(--muted-foreground))',
  [RoadmapPhase.DONE]: 'hsl(var(--success))',
};

/** Fallback columns if a roadmap somehow has none (backend seeds these; mirror it). */
export const DEFAULT_ROADMAP_COLUMNS: { key: string; label: string; color: string }[] = [
  { key: 'now', label: 'Now', color: 'hsl(248 53% 58%)' },
  { key: 'next', label: 'Next', color: 'hsl(38 92% 50%)' },
  { key: 'later', label: 'Later', color: 'hsl(220 9% 46%)' },
  { key: 'done', label: 'Done', color: 'hsl(142 55% 40%)' },
];

/** Preset palette for a roadmap column's colour — `value` is the stored CSS colour. */
export const ROADMAP_COLUMN_PALETTE: { value: string; label: string; color: string }[] = [
  { label: 'Violet', value: 'hsl(248 53% 58%)', color: 'hsl(248 53% 58%)' },
  { label: 'Blue', value: 'hsl(212 72% 52%)', color: 'hsl(212 72% 52%)' },
  { label: 'Teal', value: 'hsl(180 52% 40%)', color: 'hsl(180 52% 40%)' },
  { label: 'Green', value: 'hsl(142 55% 40%)', color: 'hsl(142 55% 40%)' },
  { label: 'Amber', value: 'hsl(38 92% 50%)', color: 'hsl(38 92% 50%)' },
  { label: 'Orange', value: 'hsl(18 80% 54%)', color: 'hsl(18 80% 54%)' },
  { label: 'Red', value: 'hsl(0 70% 58%)', color: 'hsl(0 70% 58%)' },
  { label: 'Pink', value: 'hsl(330 68% 56%)', color: 'hsl(330 68% 56%)' },
  { label: 'Slate', value: 'hsl(220 9% 46%)', color: 'hsl(220 9% 46%)' },
];

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

/** Status dot colour (semantic tokens — no new brand colours). Idea = not
 * committed, Planned = brand focus; In progress/Done deliberately match
 * `TASK_STATUS_COLOR`, so the same state reads the same across features. */
export const ROADMAP_ITEM_STATUS_COLOR: Record<RoadmapItemStatus, string> = {
  [RoadmapItemStatus.IDEA]: 'hsl(var(--muted-foreground))',
  [RoadmapItemStatus.PLANNED]: 'hsl(var(--primary))',
  [RoadmapItemStatus.IN_PROGRESS]: 'hsl(var(--info))',
  [RoadmapItemStatus.DONE]: 'hsl(var(--success))',
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

/** Difficulty dot colour (semantic tokens — no new brand colours). Escalating
 * green → amber → red, the same ramp `OKR_STATUS_COLOR` uses. */
export const ROADMAP_DIFFICULTY_COLOR: Record<RoadmapDifficulty, string> = {
  [RoadmapDifficulty.EASY]: 'hsl(var(--success))',
  [RoadmapDifficulty.MEDIUM]: 'hsl(var(--warning))',
  [RoadmapDifficulty.HARD]: 'hsl(var(--destructive))',
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

/** Qualitative OKR status for an objective / key result ('' = no status). */
export enum OkrStatus {
  ON_TRACK = 'on-track',
  AT_RISK = 'at-risk',
  OFF_TRACK = 'off-track',
  DONE = 'done',
}
export const OKR_STATUSES: OkrStatus[] = [
  OkrStatus.ON_TRACK,
  OkrStatus.AT_RISK,
  OkrStatus.OFF_TRACK,
  OkrStatus.DONE,
];
export const OKR_STATUS_LABEL: Record<OkrStatus, string> = {
  [OkrStatus.ON_TRACK]: 'On track',
  [OkrStatus.AT_RISK]: 'At risk',
  [OkrStatus.OFF_TRACK]: 'Off track',
  [OkrStatus.DONE]: 'Done',
};
/** Status dot colour (semantic tokens — no new brand colours). */
export const OKR_STATUS_COLOR: Record<OkrStatus, string> = {
  [OkrStatus.ON_TRACK]: 'hsl(var(--success))',
  [OkrStatus.AT_RISK]: 'hsl(var(--warning))',
  [OkrStatus.OFF_TRACK]: 'hsl(var(--destructive))',
  [OkrStatus.DONE]: 'hsl(var(--info))',
};

/** Task workflow columns, in order. */
export const TASK_STATUSES: TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.DONE,
];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: 'To do',
  [TaskStatus.IN_PROGRESS]: 'In progress',
  [TaskStatus.DONE]: 'Done',
};

/** Semantic color per task status (shadcn theme tokens — no new brand colors). */
export const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: 'hsl(var(--muted-foreground))',
  [TaskStatus.IN_PROGRESS]: 'hsl(var(--info))',
  [TaskStatus.DONE]: 'hsl(var(--success))',
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
