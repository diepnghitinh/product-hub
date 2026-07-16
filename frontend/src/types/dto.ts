import {
  AuditActorType,
  AuditEntityType,
  BugSeverity,
  BugStatus,
  BugStatusConfig,
  FeatureStatus,
  InboxKind,
  MilestoneStatus,
  ProjectEnvironment,
  RoadmapDifficulty,
  RoadmapItemStatus,
  RoadmapPhase,
  Role,
  SectionType,
  TaskStatus,
  TestResult,
  TestType,
  WebhookEvent,
} from './enums';

/** Flat, paginated list envelope returned by list endpoints. */
export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
export interface BugDto {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  severity: BugSeverity;
  status: BugStatus;
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
  createdAt: string;
  updatedAt: string;
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

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  phase: RoadmapPhase;
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
}

export interface RoadmapDto {
  id: string;
  tenantId: string;
  projectId: string;
  title: string;
  description: string;
  items: RoadmapItem[];
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Tasks ────────────────────────────────────────────────────────────────────
/** Flat task shape — mirrors the backend `TaskResponseDto`. Links to a backlog
 * item (roadmap item) via `roadmapItemId` + a denormalized `roadmapItemLabel`
 * (same id + human-label pattern as a bug→case link). */
export interface TaskDto {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  status: TaskStatus;
  roadmapId: string;
  roadmapItemId: string;
  roadmapItemLabel: string;
  projectId: string;
  assigneeId: string;
  assigneeName: string;
  createdBy: string;
  createdByName: string;
  dueDate: string;
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
}

export interface Objective {
  id: string;
  title: string;
  keyResults: KeyResult[];
  progress: number;
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

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
}

export interface AppSettingsDto {
  tenantId: string;
  webhooks: WebhookConfig[];
  bugStatuses: BugStatusConfig[];
}

export interface PublicProjectView {
  project: ProjectDto;
  reports: ReportDto[];
}
