import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { CustomFieldValue } from '@application/teams/domain/enums/custom-field.enums';
import { TaskStatus } from '../enums/task.enums';
import { TaskProps } from './task.props';

/** A Task — a piece of engineering work an engineer writes and links to a
 * backlog item (roadmap item). Assignable, with a todo/in-progress/done status. */
export class TaskEntity extends AggregateRoot<TaskProps> {
  private constructor(props: TaskProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
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
      assigneeId?: string;
      assigneeName?: string;
      createdBy: string;
      createdByName?: string;
      startDate?: string;
      endDate?: string;
      dueDate?: string;
      estimate?: number;
      labelKeys?: string[];
      customFields?: Record<string, CustomFieldValue>;
      order?: number;
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<TaskEntity> {
    const guard = Guard.againstNullOrUndefinedBulk([
      { argument: props.tenantId, argumentName: 'tenantId' },
      { argument: props.createdBy, argumentName: 'createdBy' },
    ]);
    if (!guard.succeeded) return Result.fail(guard.message);
    const titleGuard = Guard.againstEmptyString(props.title, 'title');
    if (!titleGuard.succeeded) return Result.fail(titleGuard.message);

    const now = new Date();
    return Result.ok(
      new TaskEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          teamId: props.teamId || '',
          ownerId: props.ownerId || '',
          parentId: props.parentId || '',
          shortId: props.shortId || '',
          title: props.title.trim(),
          description: props.description?.trim() || '',
          status: props.status ?? TaskStatus.TODO,
          roadmapId: props.roadmapId || '',
          roadmapItemId: props.roadmapItemId || '',
          roadmapItemLabel: props.roadmapItemLabel || '',
          projectId: props.projectId || '',
          assigneeId: props.assigneeId || '',
          assigneeName: props.assigneeName || '',
          createdBy: props.createdBy,
          createdByName: props.createdByName || '',
          startDate: props.startDate || '',
          // endDate is the source of truth; fall back to a legacy `dueDate` so a
          // task stored before the range existed shows its deadline as the end.
          endDate: props.endDate || props.dueDate || '',
          // dueDate mirrors endDate for old readers; seed it from whichever came in.
          dueDate: props.dueDate || props.endDate || '',
          estimate: props.estimate ?? 0,
          labelKeys: props.labelKeys ?? [],
          customFields: props.customFields ?? {},
          order: props.order ?? 0,
          createdAt: props.createdAt || now,
          updatedAt: props.updatedAt || now,
        },
        id,
      ),
    );
  }

  get id(): UniqueEntityID {
    return this._id;
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
  /** A private personal task (ownerId set) — not in a team, private to its owner. */
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

  /**
   * Access rule for a task. A team task is visible to (and editable by) anyone in
   * the tenant with the right role; a *personal* task (ownerId set) is private to
   * its owner and to admins. Used by the get/update/delete/status use-cases so a
   * personal task can't be read or mutated by another member who guesses its ref.
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
    labelKeys?: string[];
    customFields?: Record<string, CustomFieldValue>;
  }): void {
    if (fields.title !== undefined) {
      if (!fields.title.trim()) throw new Error('title cannot be empty');
      this.props.title = fields.title.trim();
    }
    if (fields.description !== undefined) this.props.description = fields.description.trim();
    if (fields.parentId !== undefined) this.props.parentId = fields.parentId;
    if (fields.roadmapId !== undefined) this.props.roadmapId = fields.roadmapId;
    if (fields.roadmapItemId !== undefined) this.props.roadmapItemId = fields.roadmapItemId;
    if (fields.roadmapItemLabel !== undefined) this.props.roadmapItemLabel = fields.roadmapItemLabel;
    if (fields.projectId !== undefined) this.props.projectId = fields.projectId;
    if (fields.startDate !== undefined) this.props.startDate = fields.startDate;
    // endDate is the deadline; keep the legacy dueDate mirror in lock-step so old
    // readers (and a rollback) stay correct.
    if (fields.endDate !== undefined) {
      this.props.endDate = fields.endDate;
      this.props.dueDate = fields.endDate;
    }
    // Legacy write path: a client still sending dueDate updates both endpoints.
    if (fields.dueDate !== undefined) {
      this.props.dueDate = fields.dueDate;
      this.props.endDate = fields.dueDate;
    }
    if (fields.estimate !== undefined) this.props.estimate = fields.estimate;
    if (fields.labelKeys !== undefined) this.props.labelKeys = fields.labelKeys;
    if (fields.customFields !== undefined) this.props.customFields = fields.customFields;
    this.touch();
  }

  setStatus(status: string): void {
    this.props.status = status;
    this.touch();
  }

  setOrder(order: number): void {
    this.props.order = order;
    this.touch();
  }

  assign(userId: string, userName: string): void {
    this.props.assigneeId = userId;
    this.props.assigneeName = userName;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
