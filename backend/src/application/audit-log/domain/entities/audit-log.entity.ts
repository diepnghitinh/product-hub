import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { AuditActor, AuditEntity } from '../enums/audit.enums';
import { AuditLogProps } from './audit-log.props';

/** An immutable record of a single field change (append-only read model). */
export class AuditLogEntity extends AggregateRoot<AuditLogProps> {
  private constructor(props: AuditLogProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      projectId: string;
      reportId: string;
      entity: AuditEntity;
      entityRef: string;
      field: string;
      oldValue: string;
      newValue: string;
      actorType: AuditActor;
      actorId: string;
      actorName: string;
      createdAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<AuditLogEntity> {
    return Result.ok(
      new AuditLogEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          projectId: props.projectId,
          reportId: props.reportId,
          entity: props.entity,
          entityRef: props.entityRef,
          field: props.field,
          oldValue: props.oldValue,
          newValue: props.newValue,
          actorType: props.actorType,
          actorId: props.actorId,
          actorName: props.actorName,
          createdAt: props.createdAt || new Date(),
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
  get projectId(): string {
    return this.props.projectId;
  }
  get reportId(): string {
    return this.props.reportId;
  }
  get entity(): AuditEntity {
    return this.props.entity;
  }
  get entityRef(): string {
    return this.props.entityRef;
  }
  get field(): string {
    return this.props.field;
  }
  get oldValue(): string {
    return this.props.oldValue;
  }
  get newValue(): string {
    return this.props.newValue;
  }
  get actorType(): AuditActor {
    return this.props.actorType;
  }
  get actorId(): string {
    return this.props.actorId;
  }
  get actorName(): string {
    return this.props.actorName;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
