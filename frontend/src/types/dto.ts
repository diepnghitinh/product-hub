import {
  AuditActorType,
  AuditEntityType,
  BugSeverity,
  BugStatus,
  BugStatusConfig,
  FavouriteKind,
  FeatureStatus,
  InboxKind,
  IssueKind,
  MilestoneStatus,
  ProjectEnvironment,
  RelationType,
  RoadmapDifficulty,
  RoadmapItemStatus,
  RoadmapPhase,
  Role,
  SectionType,
  StorageProvider,
  TaskLabelConfig,
  TaskStatus,
  TaskStatusConfig,
  TeamIssueType,
  TeamStatusConfig,
  TestResult,
  TestType,
  WebhookEvent,
  WebhookProvider,
} from './enums';

/** Flat, paginated list envelope returned by list endpoints. */
export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * One resolved issue relation (mirrors the backend IssueLinkResponseDto).
 * `relationType` is from the perspective of the issue you fetched; the linked
 * issue's fields are inlined (flat).
 */
export interface IssueRelationDto {
  id: string;
  relationType: RelationType;
  issueType: IssueKind;
  targetId: string;
  targetShortId: string;
  targetTitle: string;
  targetStatus: string;
}

export interface UserDto {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  user: UserDto;
}

/** Flat project shape — mirrors the backend `ProjectResponseDto`. Dashboard-card
 * rollups (`reportsTotal` … `progress`) are inlined; 0 until reports exist. */
export interface ProjectDto {
  id: string;
  tenantId: string;
  slug: string;
  title: string;
  subtitle: string;
  owner: string;
  createdBy: string;
  sharedWith: string[];
  pinned: boolean;
  environment: ProjectEnvironment;
  publicEnabled: boolean;
  publicToken: string | null;
  archived: boolean;
  reportsTotal: number;
  reportsDone: number;
  reportsTesting: number;
  reportsInfo: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface GroupDto {
  id: string;
  tenantId: string;
  projectId: string;
  slug: string;
  title: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

// ── Reports, sections, test cases ────────────────────────────────────────────
export interface TestCaseData {
  id: string;
  shortId: string;
  area: string;
  type: TestType | '';
  result: TestResult;
  owner: string;
  precondition?: string;
  testSteps?: string[];
  expectedResult?: string;
  actualResult?: string;
  note?: string;
}

export interface CoverageBar {
  label: string;
  percent: number;
}

export interface OverviewSection {
  id: string;
  type: SectionType.OVERVIEW;
  title: string;
  paragraphs: string[];
}
export interface ScreenshotSection {
  id: string;
  type: SectionType.SCREENSHOT;
  title: string;
  images: { src: string; alt?: string; caption?: string }[];
}
export interface CardsSection {
  id: string;
  type: SectionType.CARDS;
  title: string;
  intro?: string;
  cards: { name: string; desc: string }[];
}
export interface StepsSection {
  id: string;
  type: SectionType.STEPS;
  title: string;
  steps: { num: number; name: string; desc: string }[];
}
export interface BulletsSection {
  id: string;
  type: SectionType.BULLETS;
  title: string;
  intro?: string;
  items: string[];
}
export interface OrderedSection {
  id: string;
  type: SectionType.ORDERED;
  title: string;
  intro?: string;
  items: string[];
}
export interface TestingSection {
  id: string;
  type: SectionType.TESTING;
  title: string;
  banner?: { title: string; description: string };
  coverage: CoverageBar[];
  cases: TestCaseData[];
}
export type ReportSection =
  | OverviewSection
  | ScreenshotSection
  | CardsSection
  | StepsSection
  | BulletsSection
  | OrderedSection
  | TestingSection;

export interface ReportDto {
  id: string;
  tenantId: string;
  projectId: string;
  groupId: string;
  slug: string;
  title: string;
  subtitle: string;
  label: string;
  featureId: string;
  module: string;
  statusVariant: FeatureStatus;
  owner: string;
  reported: string;
  sections: ReportSection[];
  order: number;
  caseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectStatsDto {
  projectId: string;
  reportsTotal: number;
  reportsDone: number;
  reportsTesting: number;
  reportsInfo: number;
  progress: number;
}

export interface AuditLogDto {
  id: string;
  projectId: string;
  reportId: string;
  entity: AuditEntityType;
  entityRef: string;
  field: string;
  oldValue: string;
  newValue: string;
  actorType: AuditActorType;
  actorName: string;
  createdAt: string;
}

// ── Bugs, activity, inbox ────────────────────────────────────────────────────
/** A pinned entity in the sidebar favourites (flat; mirrors the backend). */
export interface FavouriteDto {
  kind: FavouriteKind;
  refId: string;
  title: string;
  /** Set for roadmap items — the board the item lives in. */
  roadmapId?: string;
  /** Set for team-scoped bugs/tasks. */
  teamId?: string;
  createdAt: string;
}

/** One emoji's tally on an entity (flat; mirrors the backend). */
export interface ReactionGroupDto {
  emoji: string;
  count: number;
  /** Whether the current user reacted with this emoji. */
  reactedByMe: boolean;
  /** Names of who reacted, for the hover tooltip. */
  userNames: string[];
}

export interface BugDto {
  id: string;
  /** The team that owns this bug — drives which board columns apply. */
  teamId: string;
  tenantId: string;
  /** Human-friendly per-tenant reference used in URLs, e.g. `BUG-12`. */
  shortId: string;
  title: string;
  description: string;
  severity: BugSeverity;
  /** Built-in `BugStatus` or a custom column key. */
  status: string;
  type: string;
  projectId: string;
  caseId: string;
  caseLabel: string;
  reportId: string;
  assigneeId: string;
  assigneeName: string;
  reporterId: string;
  reporterName: string;
  order: number;
  attachments: BugAttachment[];
  createdAt: string;
  updatedAt: string;
}

/** A file attached to a bug (image / short video) — matches the upload response. */
export interface BugAttachment {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

export interface CommentDto {
  id: string;
  bugId: string;
  authorId: string;
  authorName: string;
  body: string;
  mentions: string[];
  images: string[];
  createdAt: string;
  updatedAt: string;
}

export interface InboxItemDto {
  kind: InboxKind;
  id: string;
  refId: string;
  /** Stable per-notification key — passed back to mark this one read. */
  key: string;
  title: string;
  actorName: string;
  seen: boolean;
  createdAt: string;
}

export interface InboxResponseDto {
  items: InboxItemDto[];
  unseenCount: number;
  seenAt: string | null;
}

// ── Roadmaps ─────────────────────────────────────────────────────────────────
/** A person assigned to a roadmap item — denormalized (id + name). */
export interface RoadmapAssignee {
  id: string;
  name: string;
}

/** A configurable board column ("pool"): `key` is stored on each item's `phase`. */
export interface RoadmapColumn {
  key: string;
  label: string;
  color: string;
}

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  /** The column ("pool") this item sits in — a `RoadmapColumn.key`. */
  phase: string;
  status: RoadmapItemStatus;
  difficulty: RoadmapDifficulty;
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
  progress: number;
  rice: number;
  /** Optional cover / UI-reference image URL ('' when unset). */
  imageUrl: string;
  /** Optional start date, ISO `YYYY-MM-DD` ('' when unset). */
  startDate: string;
  assignees: RoadmapAssignee[];
  /** When the item was created (ISO). Set and preserved server-side; optional
   *  here only so a freshly-built draft item can omit it before the first save. */
  createdAt?: string;
  /** When work first started (status → In progress), ISO; absent until started. */
  startedAt?: string;
  /** When the item was completed (status → Done), ISO; absent until done. */
  completedAt?: string;
}

export interface RoadmapDto {
  id: string;
  tenantId: string;
  projectId: string;
  title: string;
  description: string;
  items: RoadmapItem[];
  columns: RoadmapColumn[];
  itemCount: number;
  publicEnabled: boolean;
  publicToken: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Tasks ────────────────────────────────────────────────────────────────────
/** Flat task shape — mirrors the backend `TaskResponseDto`. Links to a backlog
 * item (roadmap item) via `roadmapItemId` + a denormalized `roadmapItemLabel`
 * (same id + human-label pattern as a bug→case link). */
export interface TaskDto {
  id: string;
  /** The team that owns this task — drives which board columns apply. */
  teamId: string;
  tenantId: string;
  /** Human-friendly per-tenant reference used in URLs, e.g. `TSK-7`. */
  shortId: string;
  title: string;
  description: string;
  /** Built-in `TaskStatus` or a custom column key. */
  status: string;
  roadmapId: string;
  roadmapItemId: string;
  roadmapItemLabel: string;
  projectId: string;
  assigneeId: string;
  assigneeName: string;
  createdBy: string;
  createdByName: string;
  dueDate: string;
  /** Points on the estimate scale (see `TASK_ESTIMATES`); `0` means unset. */
  estimate: number;
  order: number;
  createdAt: string;
  updatedAt: string;
}

// ── Milestones (OKR) ─────────────────────────────────────────────────────────
export interface KeyResult {
  id: string;
  title: string;
  progress: number;
  owner: string;
  /** Share (%) of its objective. Siblings always sum to 100. */
  weight: number;
  /** Held steady while its siblings' weights rebalance. */
  locked: boolean;
  /** OKR status key ('' = no status). */
  status: string;
}

export interface Objective {
  id: string;
  title: string;
  keyResults: KeyResult[];
  /** Weighted rollup of this objective's key results (0–100). */
  progress: number;
  /** Always 100 — an objective owns all of its own scope. Not editable. */
  weight: number;
  status: string;
  notes: string;
}

export interface MilestoneDto {
  id: string;
  tenantId: string;
  title: string;
  timeframe: string;
  status: MilestoneStatus;
  objectives: Objective[];
  roadmapIds: string[];
  progress: number;
  createdAt: string;
  updatedAt: string;
}

// ── API keys, settings, sharing ──────────────────────────────────────────────
export interface ApiKeyDto {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreatedApiKeyDto extends ApiKeyDto {
  /** Full secret — returned only once. */
  key: string;
}

/** Maps a workspace member to their chat-platform id, so they can be @mentioned. */
export interface WebhookMemberMapping {
  userId: string;
  /** Lark open_id / Telegram numeric user id. */
  providerUserId: string;
  displayName: string;
}

export interface WebhookConfig {
  id: string;
  provider: WebhookProvider;
  name: string;
  /** Lark incoming-webhook URL (unused for Telegram). */
  url: string;
  /** Telegram bot token. */
  botToken?: string;
  /** Telegram chat id the bot posts to. */
  chatId?: string;
  events: WebhookEvent[];
  enabled: boolean;
  memberMappings?: WebhookMemberMapping[];
}

// ── Teams ────────────────────────────────────────────────────────────────────
/** An area of the workspace with its own issue list. QC (bugs) + Engineering
 * (tasks) are seeded on every workspace and can't be archived. */
export interface TeamDto {
  id: string;
  tenantId: string;
  /** Stable slug (`qc`, `engineering`); the name is editable. */
  key: string;
  name: string;
  issueType: TeamIssueType;
  /** Nav symbol; falls back to the issue type's icon. */
  icon: string;
  /** Accent for the symbol; null means it inherits its surroundings. */
  color: string | null;
  /** This team's board columns, in order. Resolves to the type's defaults if unset. */
  statuses: TeamStatusConfig[];
  archived: boolean;
  isDefault: boolean;
  order: number;
  publicEnabled: boolean;
  publicToken: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Cloud storage for uploaded media. Secrets are never returned — the two
 * `*Configured` booleans say whether one is stored, and the size caps drive the
 * client-side hints (videos default to 30MB).
 */
export interface StorageSettings {
  provider: StorageProvider;
  s3Region?: string;
  s3Bucket?: string;
  s3AccessKeyId?: string;
  s3Endpoint?: string;
  s3PublicBaseUrl?: string;
  s3SecretConfigured: boolean;
  azureContainer?: string;
  azureConnectionConfigured: boolean;
  maxVideoMb: number;
  maxImageMb: number;
}

export interface AppSettingsDto {
  tenantId: string;
  webhooks: WebhookConfig[];
  bugStatuses: BugStatusConfig[];
  taskStatuses: TaskStatusConfig[];
  taskLabels: TaskLabelConfig[];
  storage: StorageSettings;
}

export interface PublicProjectView {
  project: ProjectDto;
  reports: ReportDto[];
}

export interface PublicRoadmapView {
  roadmap: RoadmapDto;
}

export interface PublicTeamBoardView {
  team: TeamDto;
  issueType: TeamIssueType;
  items: (BugDto | TaskDto)[];
}
