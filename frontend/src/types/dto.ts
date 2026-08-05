import {
  ApiKeyScope,
  AuditActorType,
  AuditEntityType,
  BugSeverity,
  BugStatus,
  BugStatusConfig,
  CustomFieldConfig,
  CustomFieldValue,
  CycleMode,
  CycleStatus,
  DocFontSize,
  DocFontStyle,
  DocLinkKind,
  DocPageWidth,
  FavouriteKind,
  FeatureStatus,
  InboxKind,
  IssueKind,
  McpEntity,
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
  /** The linked issue's kind — may differ from the issue you asked about (a bug can block a task). */
  targetKind: IssueKind;
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
  /** Avatar image URL, or null/absent for the initials fallback. */
  avatarUrl?: string | null;
  /** Last authenticated request from this account, or null if never seen. Stamped
   *  at most once a minute per user, so treat it as "within the last minute". */
  lastActiveAt?: string | null;
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
  /** Set for team-scoped issues. */
  teamId?: string;
  /** Concrete issue kind (bug/task) — set for `issue` favourites; drives the
   *  sidebar link (/bugs vs /tasks) + icon. */
  issueKind?: 'bug' | 'task';
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
  /** The team cycle this bug is committed to ('' = none). */
  cycleId: string;
  /** Times auto-rollover carried this bug into the next cycle (0 = none). */
  carryOverCount: number;
  caseId: string;
  caseLabel: string;
  reportId: string;
  /** Everyone on the bug, primary first (`[]` = unassigned). */
  assignees: IssueAssigneeDto[];
  /** @deprecated Primary assignee — mirrors `assignees[0]`. */
  assigneeId: string;
  /** @deprecated Primary assignee's name — mirrors `assignees[0]`. */
  assigneeName: string;
  reporterId: string;
  reporterName: string;
  /** Optional start date, ISO `YYYY-MM-DD` ('' when unset). */
  startDate: string;
  /** Optional end / target date, ISO `YYYY-MM-DD` ('' when unset). */
  endDate: string;
  order: number;
  attachments: BugAttachment[];
  /** Keys of the team labels on this bug (resolved against its team's `labels`). */
  labelKeys: string[];
  /** Values for the team's custom fields, keyed by each field's stable `id`. */
  customFields: Record<string, CustomFieldValue>;
  createdAt: string;
  updatedAt: string;
  /**
   * When the bug was solved: the moment it entered Resolved/Closed. `null` while
   * it's open, and cleared again if it's reopened. Server-owned (stamped on the
   * status move) — what the board's "Solved date" filter ranges over.
   */
  resolvedAt: string | null;
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
  /** The issue (bug or task) this comment is on; empty for a roadmap-item comment. */
  issueId: string;
  /** Empty for a top-level comment; else the id of the comment it replies to. */
  parentId: string;
  authorId: string;
  authorName: string;
  body: string;
  mentions: string[];
  images: string[];
  /** The doc page this comment is on; empty for an issue / roadmap-item comment. */
  docPageId: string;
  /** Its doc — carried flat so a mention can link straight to the page. */
  docId: string;
  /**
   * The passage this thread is about, and enough of the text either side to tell
   * repeats of the same phrase apart. Only a top-level comment carries one; a
   * reply inherits its root's. Empty `anchorExact` = a page-level comment.
   */
  anchorExact: string;
  anchorPrefix: string;
  anchorSuffix: string;
  /** Where the quote sat when the comment was written; -1 when unanchored. */
  anchorStart: number;
  /** Ticked off. Set on the root; replies follow it. */
  resolved: boolean;
  resolvedById: string;
  resolvedByName: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** How many open threads a doc page carries — drives the badge in the page rail. */
export interface DocPageCommentCount {
  pageId: string;
  openCount: number;
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
  /** Human-friendly ref used in the item's URL (`RM-6HCUHKX`). Minted
   *  server-side; '' for items created before refs existed (and absent on a
   *  draft item the board has not saved yet) — link with `shortId || id`, which
   *  the detail page resolves either way. */
  shortId?: string;
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
  /** Optional target end date, ISO `YYYY-MM-DD` ('' when unset). Together with
   *  `startDate` this is the item's own planned window — what the timeline draws
   *  and what dragging its bar writes. Unset → the timeline falls back to
   *  deriving an end from the linked tasks. */
  endDate: string;
  assignees: RoadmapAssignee[];
  /** When the item was created (ISO). Set and preserved server-side; optional
   *  here only so a freshly-built draft item can omit it before the first save. */
  createdAt?: string;
  /** When work first started (status → In progress), ISO; absent until started. */
  startedAt?: string;
  /** When the item was completed (status → Done), ISO; absent until done. */
  completedAt?: string;
  /** Linked OKR — the milestone objective (and optionally one key result under it)
   *  this item advances. Denormalized: `okrLabel` is the leaf title shown on the
   *  card. Empty strings when unlinked; `keyResultId` is '' at the objective level. */
  milestoneId: string;
  objectiveId: string;
  keyResultId: string;
  okrLabel: string;
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
  /** When set, a *private personal* task on this user's Personal board (its
   *  columns come from the owner's `personalStatuses`, not a team). '' = a
   *  normal team task. */
  ownerId: string;
  /** Parent task id when this is a sub-task ('' for a top-level task). */
  parentId: string;
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
  /** The team cycle this task is committed to ('' = none; always '' when personal). */
  cycleId: string;
  /** Times auto-rollover carried this task into the next cycle (0 = none). */
  carryOverCount: number;
  /** Everyone on the task, primary first (`[]` = unassigned). */
  assignees: IssueAssigneeDto[];
  /** @deprecated Primary assignee — mirrors `assignees[0]`. */
  assigneeId: string;
  /** @deprecated Primary assignee's name — mirrors `assignees[0]`. */
  assigneeName: string;
  createdBy: string;
  createdByName: string;
  /** Optional start date, ISO `YYYY-MM-DD` ('' when unset). */
  startDate: string;
  /** Optional end / target date, ISO `YYYY-MM-DD` ('' when unset) — the deadline
   *  the board sorts and flags overdue on. */
  endDate: string;
  /** @deprecated Legacy alias of `endDate`, kept in sync server-side. */
  dueDate: string;
  /** Points on the estimate scale (see `TASK_ESTIMATES`); `0` means unset. */
  estimate: number;
  /** Keys of the team labels on this task (resolved against its team's `labels`). */
  labelKeys: string[];
  /** Values for the team's custom fields, keyed by each field's stable `id`. */
  customFields: Record<string, CustomFieldValue>;
  order: number;
  createdAt: string;
  updatedAt: string;
}

// ── Issues (unified task + bug) ───────────────────────────────────────────────
/** One person on an issue. The name is denormalized server-side, so a list draws
 *  avatars and names without the (admin-only) user list. */
export interface IssueAssigneeDto {
  id: string;
  name: string;
}

/**
 * Flat issue shape — the union of {@link TaskDto} and {@link BugDto} with a
 * `kind` discriminator; mirrors the backend `IssueResponseDto` served by
 * `/issues`. Kind-specific fields carry a neutral value on the other kind (a
 * task's `severity` is `''`, a bug's `estimate` is `0`), so a mixed list reads
 * without narrowing. It's a superset of `TaskDto`, so code written for a task
 * reads an issue unchanged.
 */
export interface IssueDto {
  kind: IssueKind;
  id: string;
  tenantId: string;
  /** The team that owns this issue — drives which board columns apply. */
  teamId: string;
  /** Owner of a private personal task ('' for a team issue / any bug). */
  ownerId: string;
  /** Parent issue id when this is a sub-task ('' if top-level). */
  parentId: string;
  /** Human-friendly per-tenant reference used in URLs, e.g. `TSK-7` / `BUG-12`. */
  shortId: string;
  title: string;
  description: string;
  /** Status column key — built-in or a team's custom slug (spans both kinds). */
  status: string;
  roadmapId: string;
  roadmapItemId: string;
  roadmapItemLabel: string;
  projectId: string;
  /** The team cycle this issue is committed to ('' = none; always '' when personal). */
  cycleId: string;
  /** Times auto-rollover carried this issue into the next cycle (0 = none). */
  carryOverCount: number;
  /** Everyone on the issue, primary first (`[]` = unassigned). An issue can be
   *  shared; `assigneeId`/`assigneeName` mirror the first person. */
  assignees: IssueAssigneeDto[];
  /** @deprecated Primary assignee — mirrors `assignees[0]`. Fine for a one-avatar
   *  row, but "is this person on it?" must test `assignees`. */
  assigneeId: string;
  /** @deprecated Primary assignee's name — mirrors `assignees[0]`. */
  assigneeName: string;
  createdBy: string;
  createdByName: string;
  /** Bug reporter ('' for a task). */
  reporterId: string;
  reporterName: string;
  /** Optional start date, ISO `YYYY-MM-DD` ('' when unset). */
  startDate: string;
  /** Optional end / target date, ISO `YYYY-MM-DD` ('' when unset). */
  endDate: string;
  /** @deprecated Legacy alias of `endDate` (task); kept in sync server-side. */
  dueDate: string;
  /** Points on the estimate scale (task; `0` = unset, and always `0` for a bug). */
  estimate: number;
  /** Bug severity ('' for a task). */
  severity: BugSeverity | '';
  /** Bug type/category ('' for a task). */
  type: string;
  caseId: string;
  caseLabel: string;
  reportId: string;
  attachments: BugAttachment[];
  /** Keys of the team labels on this issue. */
  labelKeys: string[];
  /** Values for the team's custom fields, keyed by each field's stable `id`. */
  customFields: Record<string, CustomFieldValue>;
  order: number;
  createdAt: string;
  updatedAt: string;
  /** When it was solved — see {@link BugDto.resolvedAt}. */
  resolvedAt: string | null;
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
  /** What this key may do through MCP — read-only, read-write, or +delete. */
  scope: ApiKeyScope;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreatedApiKeyDto extends ApiKeyDto {
  /** Full secret — returned only once. */
  key: string;
}

/**
 * One thing an MCP client created. Append-only, and denormalized on purpose:
 * the key can be revoked and the item deleted while the row stays readable.
 */
export interface McpEventDto {
  id: string;
  keyId: string;
  keyName: string;
  userId: string;
  userName: string;
  /** Which assistant made the call, e.g. `claude-code/2.1.0`. */
  clientName: string;
  /** The MCP tool that ran — `create_issue`, `create_backlog_item`, `create_doc`. */
  tool: string;
  entity: McpEntity;
  entityId: string;
  /** `TSK-6HCUHKX` for an issue, empty for a backlog item. */
  entityRef: string;
  entityTitle: string;
  /** The team's name, or the roadmap's title. */
  contextLabel: string;
  /** In-app path to the created item. */
  link: string;
  createdAt: string;
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
  /** This team's item labels, shared by its tasks/bugs. Empty until defined. */
  labels: TaskLabelConfig[];
  /** This team's custom fields, shared by its tasks/bugs. Empty until defined. */
  customFields: CustomFieldConfig[];
  /** Sprint rhythm (cycles). Off by default; the rhythm fields keep their values
   *  while off so re-enabling picks up the old settings. */
  cyclesEnabled: boolean;
  /** Who mints the cycles: `auto` (the scheduler, from the rhythm below) or
   *  `manual` (the team, by hand — every rhythm field is then inert). */
  cycleMode: CycleMode;
  /** Weeks per cycle (1–4). Auto mode only. */
  cycleLengthWeeks: number;
  /** Weeks between cycles with no current cycle at all (0–2). */
  cycleCooldownWeeks: number;
  /** Weekday a cycle starts on: 1 = Monday … 7 = Sunday. Fallback anchor, used
   *  only when `cycleStartDate` is null. */
  cycleStartDay: number;
  /** Explicit loop anchor date (YYYY-MM-DD); null = use the weekday in today's week. */
  cycleStartDate: string | null;
  /** Unfinished issues move to the next cycle when one ends. */
  cycleAutoRollover: boolean;
  archived: boolean;
  isDefault: boolean;
  order: number;
  publicEnabled: boolean;
  publicToken: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One auto-sprint of a team — mirrors the backend `CycleResponseDto`. Scope /
 *  completed are live rollups while upcoming/active, frozen history once
 *  completed. `status` is derived from the dates server-side, never stored. */
export interface CycleDto {
  id: string;
  tenantId: string;
  teamId: string;
  /** Auto-incremented per team: Cycle 1, 2, 3… On a manual team this is creation
   *  order, which needn't match date order — the list sorts by date. */
  number: number;
  /** What the team calls this cycle. `''` (the norm on an auto team) means the
   *  display falls back to "Cycle N", so the number is always the identity. */
  name: string;
  /** ISO `YYYY-MM-DD`, inclusive — same date-only convention as issue start/end. */
  startDate: string;
  endDate: string;
  /** The cycle's goal / notes (Scrum sprint goal). Plain text; `null` when unset.
   *  Survives a close, but is lost on a rhythm rebuild (all cycles renumber from 1). */
  description: string | null;
  status: CycleStatus;
  /** Issues in the cycle. */
  scopeCount: number;
  /** Story points in the cycle (always 0 on bug teams — no estimates). */
  scopePoints: number;
  completedCount: number;
  completedPoints: number;
  /** Frozen at close: ids of the issues the boundary sweep moved away — the
   *  "planned here but unfinished" list (they no longer point at this cycle).
   *  `[]` while open, and `[]` forever on cycles closed before this existed
   *  (only their counts survive). */
  unfinishedIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** One day of a cycle's burn-up — cumulative scope/started/completed, both units
 *  present so the chart draws whichever the team estimates in. */
export interface CycleBurndownPoint {
  date: string;
  scopeCount: number;
  scopePoints: number;
  startedCount: number;
  startedPoints: number;
  completedCount: number;
  completedPoints: number;
}

/** A burn-up breakdown bucket (one assignee / label / project), a current
 *  snapshot. `key` is '' for the "none" bucket; `label`/`color` are '' when the
 *  client resolves them (projects → project title). */
export interface CycleBurndownGroup {
  key: string;
  label: string;
  color: string;
  count: number;
  points: number;
  completedCount: number;
  completedPoints: number;
}

/**
 * A cycle's burn-up: the daily series plus current totals and breakdowns. The
 * started/completed curves are reconstructed from issue `updatedAt` (there's no
 * status history), so they're "best known", not an audited log. `startedColor`/
 * `completedColor` mirror the team's own board columns.
 */
export interface CycleBurndownDto {
  cycleId: string;
  number: number;
  startDate: string;
  endDate: string;
  status: CycleStatus;
  unit: 'points' | 'count';
  scopeCount: number;
  scopePoints: number;
  startedCount: number;
  startedPoints: number;
  completedCount: number;
  completedPoints: number;
  startedColor: string;
  completedColor: string;
  series: CycleBurndownPoint[];
  assignees: CycleBurndownGroup[];
  labels: CycleBurndownGroup[];
  projects: CycleBurndownGroup[];
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
  /** Cap for files attached to a doc page (PDF, Office, text). */
  maxDocMb: number;
}

export interface AppSettingsDto {
  tenantId: string;
  webhooks: WebhookConfig[];
  bugStatuses: BugStatusConfig[];
  taskStatuses: TaskStatusConfig[];
  storage: StorageSettings;
}

// ── Docs ─────────────────────────────────────────────────────────────────────
/** A record a doc page points at — a denormalized snapshot, so the chip renders
 *  without a second fetch (same shape as a favourite's ref). */
export interface DocLink {
  kind: DocLinkKind;
  /** Id of the issue / roadmap item. */
  refId: string;
  title: string;
  /** Roadmap that owns the item — routing hint, '' for an issue. */
  roadmapId: string;
  /** 'bug' | 'task' for an issue, '' otherwise — drives the detail route. */
  issueKind: string;
}

/** A file attached to a doc page — a snapshot of the upload, so the chip renders
 *  its icon and size without a second request (the public view has no session to
 *  make one with). */
export interface DocAttachment {
  /** Public URL of the stored file. */
  url: string;
  /** Original filename — the chip's label and the download name. */
  name: string;
  /** Stored MIME type — picks the glyph. */
  contentType: string;
  /** Bytes. */
  size: number;
}

/** A page in the left rail: everything the tree needs, minus the body. */
export interface DocPageSummary {
  id: string;
  docId: string;
  /** '' = a top-level page; otherwise the parent page's id. */
  parentId: string;
  title: string;
  icon: string;
  /** Accent the symbol is drawn in (a `TEAM_COLORS` value); null = inherit. */
  color: string | null;
  order: number;
  linkCount: number;
  updatedByName: string;
  updatedAt: string;
}

/** One page with its body — what the editor loads. */
export interface DocPageDto extends DocPageSummary {
  tenantId: string;
  coverUrl: string;
  /** Body as HTML (Editor.js blocks are converted on the way in/out). */
  content: string;
  links: DocLink[];
  attachments: DocAttachment[];
  /** Page Styles. Always present — the API fills in the defaults for old pages. */
  fontStyle: DocFontStyle;
  fontSize: DocFontSize;
  pageWidth: DocPageWidth;
  showCover: boolean;
  showTitle: boolean;
  showUpdated: boolean;
  showLinks: boolean;
  showAttachments: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
}

export interface DocDto {
  id: string;
  /** URL handle, `DOC-6HCUHKX`. '' on docs created before refs existed — those
   *  keep addressing by `id` until `backfill:doc-refs` runs. */
  ref: string;
  tenantId: string;
  title: string;
  icon: string;
  /** Accent the symbol is drawn in (a `TEAM_COLORS` value); null = inherit. */
  color: string | null;
  coverUrl: string;
  /** Free-text labels — what the hub's tag filter narrows on. */
  tags: string[];
  createdBy: string;
  createdByName: string;
  publicEnabled: boolean;
  publicToken: string | null;
  pageCount: number;
  /** The page tree, flat — assembled client-side from `parentId` + `order`. */
  pages: DocPageSummary[];
  createdAt: string;
  updatedAt: string;
}

/**
 * A point a page was saved at, as the history list shows it — no body, so
 * opening the panel costs one small response however long the page is.
 */
export interface DocPageVersionSummary {
  id: string;
  docId: string;
  pageId: string;
  /** The page's title when the snapshot was taken. */
  title: string;
  /** What the author called this save ('' = show the timestamp instead). */
  label: string;
  /** Characters of HTML — a rough sense of how much was there. */
  contentLength: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

/** One version with its body — what previewing an old version reads. */
export interface DocPageVersion extends DocPageVersionSummary {
  /** The page body as it stood, as HTML. */
  content: string;
}

/** A doc page attached to an issue / roadmap item, as that record sees it. */
export interface LinkedDocPage {
  docId: string;
  /** The doc's short ref (`DOC-6HCUHKX`) — `''` on docs predating refs. */
  docRef: string;
  docTitle: string;
  pageId: string;
  pageTitle: string;
  pageIcon: string;
  pageColor: string | null;
  updatedByName: string;
  updatedAt: string;
}

export interface PublicProjectView {
  project: ProjectDto;
  reports: ReportDto[];
}

export interface PublicRoadmapView {
  roadmap: RoadmapDto;
}

/** A shared doc arrives whole — every page *with* its body, read in one go. */
export interface PublicDocView {
  doc: DocDto;
  pages: DocPageDto[];
}

export interface PublicTeamBoardView {
  team: TeamDto;
  issueType: TeamIssueType;
  items: (BugDto | TaskDto)[];
}
