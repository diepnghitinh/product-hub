import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { McpEntity } from '../enums/mcp.enums';
import { McpEventProps } from './mcp-event.props';

/** One thing an MCP client created, recorded append-only (never updated). */
export class McpEventEntity extends AggregateRoot<McpEventProps> {
  private constructor(props: McpEventProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      keyId: string;
      keyName: string;
      userId: string;
      userName: string;
      clientName: string;
      tool: string;
      entity: McpEntity;
      entityId: string;
      entityRef?: string;
      entityTitle: string;
      contextLabel?: string;
      link?: string;
      createdAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<McpEventEntity> {
    if (!props.tenantId) return Result.fail('tenantId is required');
    if (!props.entityId) return Result.fail('entityId is required');
    return Result.ok(
      new McpEventEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          keyId: props.keyId,
          keyName: props.keyName,
          userId: props.userId,
          userName: props.userName,
          clientName: props.clientName,
          tool: props.tool,
          entity: props.entity,
          entityId: props.entityId,
          entityRef: props.entityRef || '',
          entityTitle: props.entityTitle,
          contextLabel: props.contextLabel || '',
          link: props.link || '',
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
  get keyId(): string {
    return this.props.keyId;
  }
  get keyName(): string {
    return this.props.keyName;
  }
  get userId(): string {
    return this.props.userId;
  }
  get userName(): string {
    return this.props.userName;
  }
  get clientName(): string {
    return this.props.clientName;
  }
  get tool(): string {
    return this.props.tool;
  }
  get entity(): McpEntity {
    return this.props.entity;
  }
  get entityId(): string {
    return this.props.entityId;
  }
  get entityRef(): string {
    return this.props.entityRef;
  }
  get entityTitle(): string {
    return this.props.entityTitle;
  }
  get contextLabel(): string {
    return this.props.contextLabel;
  }
  get link(): string {
    return this.props.link;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
