import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { BugSeverity, BugStatus } from '../enums/bug.enums';
import { BugProps } from './bug.props';

/** A Bug on the tenant's board — optionally linked to a project, assignable, with
 * a severity and a workflow status (the Kanban column). */
export class BugEntity extends AggregateRoot<BugProps> {
  private constructor(props: BugProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      title: string;
      description?: string;
      severity?: BugSeverity;
      status?: BugStatus;
      type?: string;
      projectId?: string;
      caseId?: string;
      caseLabel?: string;
      reportId?: string;
      assigneeId?: string;
      assigneeName?: string;
      reporterId: string;
      reporterName?: string;
      order?: number;
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<BugEntity> {
    const guard = Guard.againstNullOrUndefinedBulk([
      { argument: props.tenantId, argumentName: 'tenantId' },
      { argument: props.reporterId, argumentName: 'reporterId' },
    ]);
    if (!guard.succeeded) return Result.fail(guard.message);
    const titleGuard = Guard.againstEmptyString(props.title, 'title');
    if (!titleGuard.succeeded) return Result.fail(titleGuard.message);

    const now = new Date();
    return Result.ok(
      new BugEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          title: props.title.trim(),
          description: props.description?.trim() || '',
          severity: props.severity ?? BugSeverity.MEDIUM,
          status: props.status ?? BugStatus.OPEN,
          type: props.type?.trim() || '',
          projectId: props.projectId || '',
          caseId: props.caseId || '',
          caseLabel: props.caseLabel || '',
          reportId: props.reportId || '',
          assigneeId: props.assigneeId || '',
          assigneeName: props.assigneeName || '',
          reporterId: props.reporterId,
          reporterName: props.reporterName || '',
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
  get severity(): BugSeverity {
    return this.props.severity;
  }
  get status(): BugStatus {
    return this.props.status;
  }
  get type(): string {
    return this.props.type;
  }
  get projectId(): string {
    return this.props.projectId;
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
  get assigneeId(): string {
    return this.props.assigneeId;
  }
  get assigneeName(): string {
    return this.props.assigneeName;
  }
  get reporterId(): string {
    return this.props.reporterId;
  }
  get reporterName(): string {
    return this.props.reporterName;
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
    severity?: BugSeverity;
    type?: string;
    projectId?: string;
    caseId?: string;
    caseLabel?: string;
    reportId?: string;
  }): void {
    if (fields.title !== undefined) {
      if (!fields.title.trim()) throw new Error('title cannot be empty');
      this.props.title = fields.title.trim();
    }
    if (fields.description !== undefined) this.props.description = fields.description.trim();
    if (fields.severity !== undefined) this.props.severity = fields.severity;
    if (fields.type !== undefined) this.props.type = fields.type.trim();
    if (fields.projectId !== undefined) this.props.projectId = fields.projectId;
    if (fields.caseId !== undefined) this.props.caseId = fields.caseId;
    if (fields.caseLabel !== undefined) this.props.caseLabel = fields.caseLabel;
    if (fields.reportId !== undefined) this.props.reportId = fields.reportId;
    this.touch();
  }

  setStatus(status: BugStatus): void {
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
