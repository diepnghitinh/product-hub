/*
 * Shared enums — mirror the backend's `@core/interfaces` + domain enums exactly.
 * Reuse these everywhere; do not redeclare literal unions inline.
 * Source of truth: ../../docs/00-feature-inventory.md §4.
 *
 * The `*_LABEL` maps are what a person reads, so they come from the dictionary;
 * the enum *values* are what the API stores and never translate. These maps are
 * built once when this module loads, which is why switching language reloads the
 * page (see `i18n/index.ts`).
 */
import { t } from '@/i18n';

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
  /** Mentioned in a comment on a doc page. Opens the page, not the inbox's own
   *  detail pane — a document doesn't fit in a 360px column. */
  DOC_MENTION = 'doc-mention',
}

/** Kinds of entity a user can pin to their sidebar (mirrors the backend). A bug
 *  and a task are both `ISSUE`; the concrete kind rides along in `issueKind`. */
export enum FavouriteKind {
  ROADMAP_ITEM = 'roadmap-item',
  ISSUE = 'issue',
  /** The doc, not one of its pages — pinning a doc means "this handbook", and
   *  it opens where the hub would have taken you. */
  DOC = 'doc',
}

/** Entities that can carry reactions (mirrors the backend). Bugs and tasks are
 *  both `ISSUE` — reactions key off the issue's shared id, not its kind. */
export enum ReactionTargetType {
  ISSUE = 'issue',
  ROADMAP_ITEM = 'roadmap-item',
}

/** What a doc page can be attached to (mirrors the backend `DocLinkKind`). Same
 *  values as `FavouriteKind`/`ReactionTargetType`; each domain names its own. */
export enum DocLinkKind {
  ISSUE = 'issue',
  ROADMAP_ITEM = 'roadmap-item',
}

/**
 * Page Styles — how one doc page is set (mirrors the backend enums of the same
 * names). No `*_LABEL` maps: unlike a status or a priority these never appear as
 * data anywhere in the app, only as the controls in their own panel, which draws
 * each option as a specimen of the thing it turns on.
 */
export enum DocFontStyle {
  SYSTEM = 'system',
  SERIF = 'serif',
  MONO = 'mono',
}

export enum DocFontSize {
  SMALL = 'small',
  DEFAULT = 'default',
  LARGE = 'large',
}

export enum DocPageWidth {
  DEFAULT = 'default',
  FULL = 'full',
}

/** The fixed quick-reaction palette — mirrors the backend allow-list + order. */
export const REACTION_EMOJIS = ['👍', '❤️', '🎉', '😄', '🚀', '👀'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** How two same-type issues relate — the "Mark as" options (mirrors the backend). */
export enum RelationType {
  BLOCKS = 'blocks',
  BLOCKED_BY = 'blocked_by',
  PARENT_OF = 'parent_of',
  SUB_ISSUE_OF = 'sub_issue_of',
  RELATED_TO = 'related_to',
  DUPLICATE_OF = 'duplicate_of',
}

/** The kind of issue a relation connects (same-type only for now). */
export enum IssueKind {
  TASK = 'task',
  BUG = 'bug',
}

/**
 * What an MCP client created. The two issue values are the same strings as
 * `IssueKind` on purpose, so the history row picks its icon from one field.
 */
export enum McpEntity {
  TASK = 'task',
  BUG = 'bug',
  BACKLOG_ITEM = 'backlog-item',
  DOC = 'doc',
  COMMENT = 'comment',
}

/** What an API key may do through MCP — a ceiling independent of the owner's
 *  role. New keys default to read-only; a higher scope must be chosen to write. */
export enum ApiKeyScope {
  READ_ONLY = 'read-only',
  READ_WRITE = 'read-write',
  READ_WRITE_DELETE = 'read-write-delete',
}

/** Widest-to-narrowest is not meaningful for display order; least-privilege first. */
export const API_KEY_SCOPES: ApiKeyScope[] = [
  ApiKeyScope.READ_ONLY,
  ApiKeyScope.READ_WRITE,
  ApiKeyScope.READ_WRITE_DELETE,
];

export const API_KEY_SCOPE_LABEL: Record<ApiKeyScope, string> = {
  [ApiKeyScope.READ_ONLY]: t('enum.apiKeyScope.readOnly'),
  [ApiKeyScope.READ_WRITE]: t('enum.apiKeyScope.readWrite'),
  [ApiKeyScope.READ_WRITE_DELETE]: t('enum.apiKeyScope.readWriteDelete'),
};

/** The six relation options in "Mark as" menu order (matches the mockup). */
export const RELATION_TYPES: RelationType[] = [
  RelationType.PARENT_OF,
  RelationType.SUB_ISSUE_OF,
  RelationType.RELATED_TO,
  RelationType.BLOCKED_BY,
  RelationType.BLOCKS,
  RelationType.DUPLICATE_OF,
];

/** Verb form, used in the "Mark as" menu and the relation row ("Blocked by PRO-13"). */
export const RELATION_TYPE_LABEL: Record<RelationType, string> = {
  [RelationType.PARENT_OF]: t('enum.relation.parentOf'),
  [RelationType.SUB_ISSUE_OF]: t('enum.relation.subIssueOf'),
  [RelationType.RELATED_TO]: t('enum.relation.relatedTo'),
  [RelationType.BLOCKED_BY]: t('enum.relation.blockedBy'),
  [RelationType.BLOCKS]: t('enum.relation.blocks'),
  [RelationType.DUPLICATE_OF]: t('enum.relation.duplicateOf'),
};

export enum WebhookEvent {
  BUG_CREATED = 'bug-created',
  BUG_ASSIGNED = 'bug-assigned',
  COMMENT_MENTION = 'comment-mention',
}

/** Chat platforms a webhook can post to. */
export enum WebhookProvider {
  LARK = 'lark',
  TELEGRAM = 'telegram',
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
  [Role.ADMIN]: t('enum.role.admin'),
  [Role.TESTER]: t('enum.role.tester'),
  [Role.GUEST]: t('enum.role.guest'),
  [Role.PRODUCT]: t('enum.role.product'),
  [Role.DEVELOPER]: t('enum.role.developer'),
};

export const ENVIRONMENT_LABEL: Record<ProjectEnvironment, string> = {
  [ProjectEnvironment.DEVELOPMENT]: t('enum.environment.development'),
  [ProjectEnvironment.STAGING]: t('enum.environment.staging'),
  [ProjectEnvironment.PRODUCTION]: t('enum.environment.production'),
};

export const FEATURE_STATUS_LABEL: Record<FeatureStatus, string> = {
  [FeatureStatus.TESTING]: t('enum.featureStatus.testing'),
  [FeatureStatus.DONE]: t('enum.featureStatus.done'),
  [FeatureStatus.INFO]: t('enum.featureStatus.info'),
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

/** The stored value is the English word (`'Passed'`) — the API accepts exactly
 *  that, so only the pill's text is translated, never what we send. */
export const TEST_RESULT_LABEL: Record<TestResult, string> = {
  [TestResult.PASSED]: t('enum.testResult.passed'),
  [TestResult.FAILED]: t('enum.testResult.failed'),
  [TestResult.BLOCKED]: t('enum.testResult.blocked'),
  [TestResult.RETEST]: t('enum.testResult.retest'),
  [TestResult.SKIPPED]: t('enum.testResult.skipped'),
  [TestResult.UNTESTED]: t('enum.testResult.untested'),
};

export const TEST_TYPE_LABEL: Record<TestType, string> = {
  [TestType.FUNCTIONAL]: t('enum.testType.functional'),
  [TestType.UI]: t('enum.testType.ui'),
  [TestType.UX]: t('enum.testType.ux'),
  [TestType.API]: t('enum.testType.api'),
  [TestType.INTEGRATION]: t('enum.testType.integration'),
  [TestType.PERFORMANCE]: t('enum.testType.performance'),
  [TestType.SECURITY]: t('enum.testType.security'),
  [TestType.REGRESSION]: t('enum.testType.regression'),
  [TestType.ACCESSIBILITY]: t('enum.testType.accessibility'),
  [TestType.OTHER]: t('enum.testType.other'),
};

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
  [SectionType.OVERVIEW]: t('enum.sectionType.overview'),
  [SectionType.SCREENSHOT]: t('enum.sectionType.screenshot'),
  [SectionType.CARDS]: t('enum.sectionType.cards'),
  [SectionType.STEPS]: t('enum.sectionType.steps'),
  [SectionType.BULLETS]: t('enum.sectionType.bullets'),
  [SectionType.ORDERED]: t('enum.sectionType.ordered'),
  [SectionType.TESTING]: t('enum.sectionType.testing'),
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
  [BugSeverity.LOW]: t('enum.bugSeverity.low'),
  [BugSeverity.MEDIUM]: t('enum.bugSeverity.medium'),
  [BugSeverity.HIGH]: t('enum.bugSeverity.high'),
  [BugSeverity.CRITICAL]: t('enum.bugSeverity.critical'),
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
  [BugStatus.OPEN]: t('enum.bugStatus.open'),
  [BugStatus.IN_PROGRESS]: t('enum.bugStatus.inProgress'),
  [BugStatus.BLOCKED]: t('enum.bugStatus.blocked'),
  [BugStatus.RESOLVED]: t('enum.bugStatus.resolved'),
  [BugStatus.CLOSED]: t('enum.bugStatus.closed'),
};

/** A tenant-configurable bug board column. `key` is the fixed workflow value;
 * `label`, `color` and order are admin-editable (see AdminSettingsPage). */
export interface BugStatusConfig {
  /** Built-in `BugStatus` or a tenant's custom column slug. */
  key: string;
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
  [InboxKind.MENTION]: t('enum.inboxKind.mention'),
  [InboxKind.ASSIGNED_BUG]: t('enum.inboxKind.assigned'),
  [InboxKind.DOC_MENTION]: t('enum.inboxKind.docMention'),
};

export const FAVOURITE_KIND_LABEL: Record<FavouriteKind, string> = {
  [FavouriteKind.ROADMAP_ITEM]: t('enum.favouriteKind.roadmapItem'),
  [FavouriteKind.ISSUE]: t('enum.favouriteKind.issue'),
  [FavouriteKind.DOC]: t('enum.favouriteKind.doc'),
};

export const ROADMAP_PHASES: RoadmapPhase[] = [
  RoadmapPhase.NOW,
  RoadmapPhase.NEXT,
  RoadmapPhase.LATER,
  RoadmapPhase.DONE,
];

export const ROADMAP_PHASE_LABEL: Record<RoadmapPhase, string> = {
  [RoadmapPhase.NOW]: t('enum.roadmapPhase.now'),
  [RoadmapPhase.NEXT]: t('enum.roadmapPhase.next'),
  [RoadmapPhase.LATER]: t('enum.roadmapPhase.later'),
  [RoadmapPhase.DONE]: t('enum.roadmapPhase.done'),
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
  { key: 'now', label: ROADMAP_PHASE_LABEL[RoadmapPhase.NOW], color: 'hsl(248 53% 58%)' },
  { key: 'next', label: ROADMAP_PHASE_LABEL[RoadmapPhase.NEXT], color: 'hsl(38 92% 50%)' },
  { key: 'later', label: ROADMAP_PHASE_LABEL[RoadmapPhase.LATER], color: 'hsl(220 9% 46%)' },
  { key: 'done', label: ROADMAP_PHASE_LABEL[RoadmapPhase.DONE], color: 'hsl(142 55% 40%)' },
];

/** Preset palette for a roadmap column's colour — `value` is the stored CSS colour. */
export const ROADMAP_COLUMN_PALETTE: { value: string; label: string; color: string }[] = [
  { label: t('enum.colour.violet'), value: 'hsl(248 53% 58%)', color: 'hsl(248 53% 58%)' },
  { label: t('enum.colour.blue'), value: 'hsl(212 72% 52%)', color: 'hsl(212 72% 52%)' },
  { label: t('enum.colour.teal'), value: 'hsl(180 52% 40%)', color: 'hsl(180 52% 40%)' },
  { label: t('enum.colour.green'), value: 'hsl(142 55% 40%)', color: 'hsl(142 55% 40%)' },
  { label: t('enum.colour.amber'), value: 'hsl(38 92% 50%)', color: 'hsl(38 92% 50%)' },
  { label: t('enum.colour.orange'), value: 'hsl(18 80% 54%)', color: 'hsl(18 80% 54%)' },
  { label: t('enum.colour.red'), value: 'hsl(0 70% 58%)', color: 'hsl(0 70% 58%)' },
  { label: t('enum.colour.pink'), value: 'hsl(330 68% 56%)', color: 'hsl(330 68% 56%)' },
  { label: t('enum.colour.slate'), value: 'hsl(220 9% 46%)', color: 'hsl(220 9% 46%)' },
];

export const ROADMAP_ITEM_STATUSES: RoadmapItemStatus[] = [
  RoadmapItemStatus.IDEA,
  RoadmapItemStatus.PLANNED,
  RoadmapItemStatus.IN_PROGRESS,
  RoadmapItemStatus.DONE,
];

export const ROADMAP_ITEM_STATUS_LABEL: Record<RoadmapItemStatus, string> = {
  [RoadmapItemStatus.IDEA]: t('enum.roadmapItemStatus.idea'),
  [RoadmapItemStatus.PLANNED]: t('enum.roadmapItemStatus.planned'),
  [RoadmapItemStatus.IN_PROGRESS]: t('enum.roadmapItemStatus.inProgress'),
  [RoadmapItemStatus.DONE]: t('enum.roadmapItemStatus.done'),
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
  [RoadmapDifficulty.EASY]: t('enum.roadmapDifficulty.easy'),
  [RoadmapDifficulty.MEDIUM]: t('enum.roadmapDifficulty.medium'),
  [RoadmapDifficulty.HARD]: t('enum.roadmapDifficulty.hard'),
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
  [MilestoneStatus.ACTIVE]: t('enum.milestoneStatus.active'),
  [MilestoneStatus.COMPLETED]: t('enum.milestoneStatus.completed'),
  [MilestoneStatus.ARCHIVED]: t('enum.milestoneStatus.archived'),
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
  [OkrStatus.ON_TRACK]: t('enum.okrStatus.onTrack'),
  [OkrStatus.AT_RISK]: t('enum.okrStatus.atRisk'),
  [OkrStatus.OFF_TRACK]: t('enum.okrStatus.offTrack'),
  [OkrStatus.DONE]: t('enum.okrStatus.done'),
};
/** Status dot colour (semantic tokens — no new brand colours). */
export const OKR_STATUS_COLOR: Record<OkrStatus, string> = {
  [OkrStatus.ON_TRACK]: 'hsl(var(--success))',
  [OkrStatus.AT_RISK]: 'hsl(var(--warning))',
  [OkrStatus.OFF_TRACK]: 'hsl(var(--destructive))',
  [OkrStatus.DONE]: 'hsl(var(--info))',
};

/** Cloud storage provider for uploaded media (Settings → Storage). */
export enum StorageProvider {
  NONE = 'none',
  S3 = 's3',
  AZURE = 'azure',
}
export const STORAGE_PROVIDERS: StorageProvider[] = [
  StorageProvider.NONE,
  StorageProvider.S3,
  StorageProvider.AZURE,
];
export const STORAGE_PROVIDER_LABEL: Record<StorageProvider, string> = {
  [StorageProvider.NONE]: t('enum.storageProvider.none'),
  [StorageProvider.S3]: t('enum.storageProvider.s3'),
  [StorageProvider.AZURE]: t('enum.storageProvider.azure'),
};

/** Task workflow columns, in order. */
export const TASK_STATUSES: TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.DONE,
];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: t('enum.taskStatus.todo'),
  [TaskStatus.IN_PROGRESS]: t('enum.taskStatus.inProgress'),
  [TaskStatus.DONE]: t('enum.taskStatus.done'),
};

/** Semantic color per task status (shadcn theme tokens — no new brand colors). */
export const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: 'hsl(var(--muted-foreground))',
  [TaskStatus.IN_PROGRESS]: 'hsl(var(--info))',
  [TaskStatus.DONE]: 'hsl(var(--success))',
};

/** Safe label/color for any status key (built-in or custom) — custom keys fall
 * back to the raw key + a neutral dot. Prefer the tenant config where loaded. */
export const taskStatusLabel = (key: string): string =>
  TASK_STATUS_LABEL[key as TaskStatus] ?? key;
export const taskStatusColor = (key: string): string =>
  TASK_STATUS_COLOR[key as TaskStatus] ?? 'hsl(var(--muted-foreground))';

/**
 * Is this issue finished? The terminal column differs by kind — a task ends at
 * `done`, a bug at `resolved`/`closed` — so any rollup over a mixed list (a
 * backlog item's linked work) has to ask per issue, not compare to `DONE`.
 * A team's *custom* column matches neither and counts as unfinished.
 */
export const isIssueDone = (kind: IssueKind, status: string): boolean =>
  kind === IssueKind.BUG
    ? status === BugStatus.RESOLVED || status === BugStatus.CLOSED
    : status === TaskStatus.DONE;

/** Points scale for a task's size estimate (mirrors the backend
 * `TASK_ESTIMATE_VALUES`). `0` means unset ("No estimate"). */
export const TASK_ESTIMATES = [1, 2, 3, 5, 8, 13, 21] as const;

export const taskEstimateLabel = (value: number): string =>
  value === 0
    ? t('enum.estimate.none')
    : t(value === 1 ? 'enum.estimate.one' : 'enum.estimate.many').replace('{n}', String(value));

/** A tenant-defined task label. No built-ins — a workspace defines its own. */
export interface TaskLabelConfig {
  /** Stable slug stored on a task; the name/colour are editable. */
  key: string;
  name: string;
  color: string;
}

/** Kinds of team-defined custom field (Jira/ClickUp-style). Mirrors the backend. */
export enum CustomFieldType {
  TEXT = 'text',
  NUMBER = 'number',
  SELECT = 'select',
  DATE = 'date',
  CHECKBOX = 'checkbox',
}

export const CUSTOM_FIELD_TYPES: CustomFieldType[] = [
  CustomFieldType.TEXT,
  CustomFieldType.NUMBER,
  CustomFieldType.SELECT,
  CustomFieldType.DATE,
  CustomFieldType.CHECKBOX,
];

/** Type names for the picker (a small controlled vocabulary, like ROLE_LABEL). */
export const CUSTOM_FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  [CustomFieldType.TEXT]: t('enum.customFieldType.text'),
  [CustomFieldType.NUMBER]: t('enum.customFieldType.number'),
  [CustomFieldType.SELECT]: t('enum.customFieldType.select'),
  [CustomFieldType.DATE]: t('enum.customFieldType.date'),
  [CustomFieldType.CHECKBOX]: t('enum.customFieldType.checkbox'),
};

/** True when the field type carries a fixed option list (only `select` does). */
export function fieldTypeHasOptions(type: CustomFieldType): boolean {
  return type === CustomFieldType.SELECT;
}

/**
 * A team-defined custom field. `id` is the stable key stored in each item's
 * `customFields` map; name/options/required stay editable. `options` is only
 * meaningful for a `select` field.
 */
export interface CustomFieldConfig {
  id: string;
  name: string;
  type: CustomFieldType;
  options?: string[];
  required?: boolean;
}

/** A stored custom-field value on a task/bug. Date is an ISO `YYYY-MM-DD` string. */
export type CustomFieldValue = string | number | boolean;

/** What kind of issue list a team owns — its board renders accordingly. */
export enum TeamIssueType {
  BUG = 'bug',
  TASK = 'task',
}

export const TEAM_ISSUE_TYPES: TeamIssueType[] = [TeamIssueType.BUG, TeamIssueType.TASK];


/**
 * A team's board column. Structurally identical to `BugStatusConfig` /
 * `TaskStatusConfig` — a team owns one issue type, so one shape covers both.
 */
export type TeamStatusConfig = BugStatusConfig;

/** The columns a team of this type starts with — and can never drop. */
export function defaultStatusesFor(issueType: TeamIssueType): TeamStatusConfig[] {
  return issueType === TeamIssueType.BUG ? DEFAULT_BUG_STATUSES : DEFAULT_TASK_STATUSES;
}

/** Built-ins are the board's contract: rollups read their keys literally. */
export function builtinStatusKeys(issueType: TeamIssueType): Set<string> {
  return new Set(defaultStatusesFor(issueType).map((s) => s.key));
}

/** A team with no icon stored falls back to the symbol for the list it owns. */
export function defaultTeamIcon(issueType: TeamIssueType): string {
  return issueType === TeamIssueType.BUG ? 'bug' : 'tasks';
}

/**
 * Accents a team's symbol can take — the same palette the roadmap columns use,
 * mirroring the backend's `TEAM_COLORS`, which validates on write.
 */
export const TEAM_COLORS: string[] = ROADMAP_COLUMN_PALETTE.map((c) => c.value);

export const TEAM_ISSUE_TYPE_LABEL: Record<TeamIssueType, string> = {
  [TeamIssueType.BUG]: t('enum.teamIssueType.bug'),
  [TeamIssueType.TASK]: t('enum.teamIssueType.task'),
};

/** Where a team cycle sits in time — derived from its dates, never stored. */
export enum CycleStatus {
  UPCOMING = 'upcoming',
  ACTIVE = 'active',
  COMPLETED = 'completed',
}

/** Who mints a team's cycles. `auto` is the default and the original behaviour;
 *  in `manual` the rhythm fields below go inert and the team plans each cycle by
 *  hand. Either way the *end* of a cycle stays automatic. */
export enum CycleMode {
  AUTO = 'auto',
  MANUAL = 'manual',
}

/** `?cycle=` / cycleId filter sentinels the API resolves server-side, so saved
 *  links (sidebar's Current/Upcoming) never go stale as cycles roll. */
export const CYCLE_FILTER_CURRENT = 'current';
export const CYCLE_FILTER_UPCOMING = 'upcoming';
export const CYCLE_FILTER_NONE = 'none';

/** `cycleStartDay` scale: 1 = Monday … 7 = Sunday (ISO weekday numbers). */
export const CYCLE_START_DAYS: number[] = [1, 2, 3, 4, 5, 6, 7];

/** Weekday label per `cycleStartDay` value (same label-map pattern as
 *  `CUSTOM_FIELD_TYPE_LABEL`). */
export const CYCLE_START_DAY_LABEL: Record<number, string> = {
  1: t('enum.weekday.1'),
  2: t('enum.weekday.2'),
  3: t('enum.weekday.3'),
  4: t('enum.weekday.4'),
  5: t('enum.weekday.5'),
  6: t('enum.weekday.6'),
  7: t('enum.weekday.7'),
};

/** Cycle rhythm bounds (mirror the backend guards). */
export const CYCLE_LENGTH_WEEKS = [1, 2, 3, 4];
export const CYCLE_COOLDOWN_WEEKS = [0, 1, 2];

/** Tenant-configurable task board column (mirrors `BugStatusConfig`). */
export interface TaskStatusConfig {
  /** Built-in `TaskStatus` or a custom column slug. */
  key: string;
  label: string;
  color: string;
}

/** Client fallback until the tenant's task columns load (mirrors the backend).
 * Colors are concrete hex (the config stores hex), matching the token hues. */
export const DEFAULT_TASK_STATUSES: TaskStatusConfig[] = [
  { key: TaskStatus.TODO, label: TASK_STATUS_LABEL[TaskStatus.TODO], color: '#6b7280' },
  {
    key: TaskStatus.IN_PROGRESS,
    label: TASK_STATUS_LABEL[TaskStatus.IN_PROGRESS],
    color: '#2563eb',
  },
  { key: TaskStatus.DONE, label: TASK_STATUS_LABEL[TaskStatus.DONE], color: '#16a34a' },
];

export const WEBHOOK_PROVIDERS: WebhookProvider[] = [
  WebhookProvider.LARK,
  WebhookProvider.TELEGRAM,
];

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  WebhookEvent.BUG_CREATED,
  WebhookEvent.BUG_ASSIGNED,
  WebhookEvent.COMMENT_MENTION,
];

export const WEBHOOK_EVENT_LABEL: Record<WebhookEvent, string> = {
  [WebhookEvent.BUG_CREATED]: t('enum.webhookEvent.bugCreated'),
  [WebhookEvent.BUG_ASSIGNED]: t('enum.webhookEvent.bugAssigned'),
  [WebhookEvent.COMMENT_MENTION]: t('enum.webhookEvent.commentMention'),
};
