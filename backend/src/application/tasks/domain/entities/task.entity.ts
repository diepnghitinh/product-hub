import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
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
      title: string;
      description?: string;
      status?: TaskStatus;
      roadmapId?: string;
      roadmapItemId?: string;
      roadmapItemLabel?: string;
      projectId?: string;
      assigneeId?: string;
      assigneeName?: string;
      createdBy: string;
      createdByName?: string;
      dueDate?: string;
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
          dueDate: props.dueDate || '',
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
  get title(): string {
    return this.props.title;
  }
  get description(): string {
    return this.props.description;
  }
  get status(): TaskStatus {
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
  get dueDate(): string {
    return this.props.dueDate;
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

  applyUpdate(fields: {
    title?: string;
    description?: string;
    roadmapId?: string;
    roadmapItemId?: string;
    roadmapItemLabel?: string;
    projectId?: string;
    dueDate?: string;
  }): void {
    if (fields.title !== undefined) {
      if (!fields.title.trim()) throw new Error('title cannot be empty');
      this.props.title = fields.title.trim();
    }
    if (fields.description !== undefined) this.props.description = fields.description.trim();
    if (fields.roadmapId !== undefined) this.props.roadmapId = fields.roadmapId;
    if (fields.roadmapItemId !== undefined) this.props.roadmapItemId = fields.roadmapItemId;
    if (fields.roadmapItemLabel !== undefined) this.props.roadmapItemLabel = fields.roadmapItemLabel;
    if (fields.projectId !== undefined) this.props.projectId = fields.projectId;
    if (fields.dueDate !== undefined) this.props.dueDate = fields.dueDate;
    this.touch();
  }

  setStatus(status: TaskStatus): void {
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
