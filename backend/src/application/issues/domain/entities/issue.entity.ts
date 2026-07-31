import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { CustomFieldValue } from '@application/teams/domain/enums/custom-field.enums';
import {
  BugAttachment,
  BugSeverity,
  BugStatus,
  IssueKind,
  TaskStatus,
  isCompletedStatus,
} from '../enums/issue.enums';
import { IssueAssignee, IssueProps } from './issue.props';

/**
 * Normalizes whatever a caller had into the canonical assignee list: the list if
 * it was given, else the legacy single pair, else nobody. Blank ids and repeats
 * are dropped — the same person can't be on an issue twice, and `''` is how
 * "unassigned" is stored, not a person.
 */
function normalizeAssignees(
  assignees: IssueAssignee[] | undefined,
  legacyId?: string,
  legacyName?: string,
): IssueAssignee[] {
  const list = assignees ?? (legacyId ? [{ id: legacyId, name: legacyName || '' }] : []);
  const seen = new Set<string>();
  return list.filter((a) => {
    if (!a?.id || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

/**
 * An **Issue** — the unified piece of work that used to be a Task *or* a Bug. Its
 * `kind` says which. A task links to a backlog item and carries an estimate; a bug
 * carries a severity, a reporter and attachments. Both are assignable, live in a
 * team's list (or, for a personal task, on a private board), and move across the
 * board's status columns.
 */
export class IssueEntity extends AggregateRoot<IssueProps> {
  private constructor(props: IssueProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      kind: IssueKind;
      tenantId: string;
      teamId?: string;
      ownerId?: string;
      parentId?: string;
      shortId?: string;
      title: string;
      description?: string;
      status?: string;
      roadmapId?: string;
      roadmapItemId?: string;
      roadmapItemLabel?: string;
      projectId?: string;
      cycleId?: string;
      carryOverCount?: number;
      /** Everyone on it. A single `assigneeId`/`assigneeName` still works and is
       *  read as a one-person list — that's how a legacy stored issue loads. */
      assignees?: IssueAssignee[];
      assigneeId?: string;
      assigneeName?: string;
      createdBy: string;
      createdByName?: string;
      reporterId?: string;
      reporterName?: string;
      startDate?: string;
      endDate?: string;
      dueDate?: string;
      estimate?: number;
      severity?: BugSeverity | '';
      type?: string;
      caseId?: string;
      caseLabel?: string;
      reportId?: string;
      attachments?: BugAttachment[];
      labelKeys?: string[];
      customFields?: Record<string, CustomFieldValue>;
      order?: number;
      createdAt?: Date;
      updatedAt?: Date;
      resolvedAt?: Date | null;
    },
    id?: UniqueEntityID,
  ): Result<IssueEntity> {
    const guard = Guard.againstNullOrUndefinedBulk([
      { argument: props.tenantId, argumentName: 'tenantId' },
      { argument: props.kind, argumentName: 'kind' },
      { argument: props.createdBy, argumentName: 'createdBy' },
    ]);
    if (!guard.succeeded) return Result.fail(guard.message);
    const titleGuard = Guard.againstEmptyString(props.title, 'title');
    if (!titleGuard.succeeded) return Result.fail(titleGuard.message);

    const isTask = props.kind === IssueKind.TASK;
    const now = new Date();
    const assignees = normalizeAssignees(props.assignees, props.assigneeId, props.assigneeName);
    const status = props.status ?? (isTask ? TaskStatus.TODO : BugStatus.OPEN);
    return Result.ok(
      new IssueEntity(
        {
          id: id || new UniqueEntityID(),
          kind: props.kind,
          tenantId: props.tenantId,
          teamId: props.teamId || '',
          ownerId: props.ownerId || '',
          parentId: props.parentId || '',
          shortId: props.shortId || '',
          title: props.title.trim(),
          description: props.description?.trim() || '',
          status,
          roadmapId: props.roadmapId || '',
          roadmapItemId: props.roadmapItemId || '',
          roadmapItemLabel: props.roadmapItemLabel || '',
          projectId: props.projectId || '',
          cycleId: props.cycleId || '',
          carryOverCount: props.carryOverCount ?? 0,
          assignees,
          // The mirror is always `assignees[0]` — never passed through on its own.
          assigneeId: assignees[0]?.id ?? '',
          assigneeName: assignees[0]?.name ?? '',
          createdBy: props.createdBy,
          createdByName: props.createdByName || '',
          reporterId: props.reporterId || '',
          reporterName: props.reporterName || '',
          startDate: props.startDate || '',
          // A task's endDate is the source of truth; fall back to the legacy
          // `dueDate` so a task stored before the range existed shows its deadline.
          // Bugs have no dueDate concept, so their endDate stands alone.
          endDate: props.endDate || (isTask ? props.dueDate || '' : ''),
          // dueDate is a task-only legacy mirror of endDate; always '' for a bug.
          dueDate: isTask ? props.dueDate || props.endDate || '' : '',
          estimate: isTask ? props.estimate ?? 0 : 0,
          severity: isTask ? '' : props.severity ?? BugSeverity.MEDIUM,
          type: props.type?.trim() || '',
          caseId: props.caseId || '',
          caseLabel: props.caseLabel || '',
          reportId: props.reportId || '',
          attachments: props.attachments ?? [],
          labelKeys: props.labelKeys ?? [],
          customFields: props.customFields ?? {},
          order: props.order ?? 0,
          createdAt: props.createdAt || now,
          updatedAt: props.updatedAt || now,
          // `undefined` means "not supplied" — a brand-new issue, so an issue
          // created straight into a done column (the + Add on Resolved) is
          // stamped now. A row loaded from the store always passes the field
          // explicitly (`doc.resolvedAt ?? null`), so a pre-`resolvedAt` bug
          // that is already resolved keeps its blank stamp instead of silently
          // acquiring today's date the first time it is read and re-saved.
          resolvedAt:
            props.resolvedAt !== undefined
              ? props.resolvedAt
              : isCompletedStatus(props.kind, status)
                ? now
                : null,
        },
        id,
      ),
    );
  }

  get id(): UniqueEntityID {
    return this._id;
  }
  get kind(): IssueKind {
    return this.props.kind;
  }
  get isBug(): boolean {
    return this.props.kind === IssueKind.BUG;
  }
  get isTask(): boolean {
    return this.props.kind === IssueKind.TASK;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get teamId(): string {
    return this.props.teamId;
  }
  get ownerId(): string {
    return this.props.ownerId;
  }
  /** A private personal task (ownerId set) — not in a team, private to its owner.
   *  Always false for a bug (bugs are never personal). */
  get isPersonal(): boolean {
    return this.props.ownerId !== '';
  }
  get parentId(): string {
    return this.props.parentId;
  }
  get shortId(): string {
    return this.props.shortId;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string {
    return this.props.description;
  }
  get status(): string {
    return this.props.status;
  }
  get roadmapId(): string {
    return this.props.roadmapId;
  }
  get roadmapItemId(): string {
    return this.props.roadmapItemId;
  }
  get roadmapItemLabel(): string {
    return this.props.roadmapItemLabel;
  }
  get projectId(): string {
    return this.props.projectId;
  }
  get cycleId(): string {
    return this.props.cycleId;
  }
  get carryOverCount(): number {
    return this.props.carryOverCount;
  }
  get assignees(): IssueAssignee[] {
    return this.props.assignees;
  }
  /** The primary assignee's id — `assignees[0]`, kept as a field for old readers. */
  get assigneeId(): string {
    return this.props.assigneeId;
  }
  get assigneeName(): string {
    return this.props.assigneeName;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdByName(): string {
    return this.props.createdByName;
  }
  get reporterId(): string {
    return this.props.reporterId;
  }
  get reporterName(): string {
    return this.props.reporterName;
  }
  get startDate(): string {
    return this.props.startDate;
  }
  get endDate(): string {
    return this.props.endDate;
  }
  get dueDate(): string {
    return this.props.dueDate;
  }
  get estimate(): number {
    return this.props.estimate;
  }
  get severity(): BugSeverity | '' {
    return this.props.severity;
  }
  get type(): string {
    return this.props.type;
  }
  get caseId(): string {
    return this.props.caseId;
  }
  get caseLabel(): string {
    return this.props.caseLabel;
  }
  get reportId(): string {
    return this.props.reportId;
  }
  get attachments(): BugAttachment[] {
    return this.props.attachments;
  }
  get labelKeys(): string[] {
    return this.props.labelKeys;
  }
  get customFields(): Record<string, CustomFieldValue> {
    return this.props.customFields;
  }
  get order(): number {
    return this.props.order;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  /** When it became finished (`null` while open) — see {@link setStatus}. */
  get resolvedAt(): Date | null {
    return this.props.resolvedAt;
  }
  /** In a done column right now (resolved/closed for a bug, done for a task). */
  get isCompleted(): boolean {
    return isCompletedStatus(this.props.kind, this.props.status);
  }

  /**
   * Access rule. A team issue is visible to (and editable by) anyone in the tenant
   * with the right role; a *personal* task (ownerId set) is private to its owner
   * and to admins. Bugs are never personal, so this is always true for them — a
   * bug's stricter delete gate lives in the delete use-case (admin/product only).
   */
  isVisibleTo(userId: string, isAdmin: boolean): boolean {
    return !this.isPersonal || this.props.ownerId === userId || isAdmin;
  }

  applyUpdate(fields: {
    title?: string;
    description?: string;
    parentId?: string;
    roadmapId?: string;
    roadmapItemId?: string;
    roadmapItemLabel?: string;
    projectId?: string;
    startDate?: string;
    endDate?: string;
    dueDate?: string;
    estimate?: number;
    severity?: BugSeverity;
    type?: string;
    caseId?: string;
    caseLabel?: string;
    reportId?: string;
    attachments?: BugAttachment[];
    labelKeys?: string[];
    customFields?: Record<string, CustomFieldValue>;
  }): void {
    if (fields.title !== undefined) {
      if (!fields.title.trim()) throw new Error('title cannot be empty');
      this.props.title = fields.title.trim();
    }
    if (fields.description !== undefined) this.props.description = fields.description.trim();
    if (fields.projectId !== undefined) this.props.projectId = fields.projectId;
    if (fields.startDate !== undefined) this.props.startDate = fields.startDate;
    // endDate is the deadline for both kinds. For a task, keep the legacy dueDate
    // mirror in lock-step; a bug has no dueDate so it stays ''.
    if (fields.endDate !== undefined) {
      this.props.endDate = fields.endDate;
      if (this.isTask) this.props.dueDate = fields.endDate;
    }
    // Legacy task write path: a client still sending dueDate updates both ends.
    if (fields.dueDate !== undefined && this.isTask) {
      this.props.dueDate = fields.dueDate;
      this.props.endDate = fields.dueDate;
    }
    if (fields.labelKeys !== undefined) this.props.labelKeys = fields.labelKeys;
    if (fields.customFields !== undefined) this.props.customFields = fields.customFields;

    // Task-only fields.
    if (fields.parentId !== undefined) this.props.parentId = fields.parentId;
    if (fields.roadmapId !== undefined) this.props.roadmapId = fields.roadmapId;
    if (fields.roadmapItemId !== undefined) this.props.roadmapItemId = fields.roadmapItemId;
    if (fields.roadmapItemLabel !== undefined) this.props.roadmapItemLabel = fields.roadmapItemLabel;
    if (fields.estimate !== undefined) this.props.estimate = fields.estimate;

    // Bug-only fields.
    if (fields.severity !== undefined) this.props.severity = fields.severity;
    if (fields.type !== undefined) this.props.type = fields.type.trim();
    if (fields.caseId !== undefined) this.props.caseId = fields.caseId;
    if (fields.caseLabel !== undefined) this.props.caseLabel = fields.caseLabel;
    if (fields.reportId !== undefined) this.props.reportId = fields.reportId;
    if (fields.attachments !== undefined) this.props.attachments = fields.attachments;

    this.touch();
  }

  /**
   * Move to another status column — and keep {@link resolvedAt} honest, since
   * that stamp is the only record of *when* a bug was solved (the board's
   * "Solved date" filter and any time-to-fix reading are built on it).
   *
   * Crossing **into** the done set stamps the moment; crossing back **out** — a
   * reopen — clears it. Moving *within* the done set (resolved → closed) is not
   * a new fix, so the original moment stands.
   */
  setStatus(status: string): void {
    const wasCompleted = this.isCompleted;
    const nowCompleted = isCompletedStatus(this.props.kind, status);
    this.props.status = status;
    if (nowCompleted && !wasCompleted) this.props.resolvedAt = new Date();
    else if (!nowCompleted && wasCompleted) this.props.resolvedAt = null;
    this.touch();
  }

  setOrder(order: number): void {
    this.props.order = order;
    this.touch();
  }

  /**
   * Put these people on it, in order — the first is the primary. This is the only
   * way the assignee mirror moves, so `assigneeId` can't drift from the list.
   * Pass `[]` to unassign.
   */
  setAssignees(assignees: IssueAssignee[]): void {
    const next = normalizeAssignees(assignees);
    this.props.assignees = next;
    this.props.assigneeId = next[0]?.id ?? '';
    this.props.assigneeName = next[0]?.name ?? '';
    this.touch();
  }

  /** Single-assignee shorthand kept for the callers that only ever have one
   *  person (bulk bar, MCP, quick-add); `('', '')` unassigns. */
  assign(userId: string, userName: string): void {
    this.setAssignees(userId ? [{ id: userId, name: userName }] : []);
  }

  /** Commit to (or leave, with '') a team cycle. The use-case validates the
   *  cycle — same team, not completed — like `assign` validates the user.
   *  A manual placement is a deliberate fresh commitment, so it clears the
   *  auto-rollover carry count (only the scheduler's boundary sweep accrues it). */
  setCycle(cycleId: string): void {
    this.props.cycleId = cycleId;
    this.props.carryOverCount = 0;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
