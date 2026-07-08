import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { ApiKeyProps } from './api-key.props';

/** A per-tenant API key. Only its hash is stored. */
export class ApiKeyEntity extends AggregateRoot<ApiKeyProps> {
  private constructor(props: ApiKeyProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      name: string;
      keyHash: string;
      prefix: string;
      createdBy: string;
      lastUsedAt?: Date | null;
      createdAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<ApiKeyEntity> {
    const guard = Guard.againstNullOrUndefinedBulk([
      { argument: props.tenantId, argumentName: 'tenantId' },
      { argument: props.keyHash, argumentName: 'keyHash' },
    ]);
    if (!guard.succeeded) return Result.fail(guard.message);
    const nameGuard = Guard.againstEmptyString(props.name, 'name');
    if (!nameGuard.succeeded) return Result.fail(nameGuard.message);

    return Result.ok(
      new ApiKeyEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          name: props.name.trim(),
          keyHash: props.keyHash,
          prefix: props.prefix,
          createdBy: props.createdBy,
          lastUsedAt: props.lastUsedAt ?? null,
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
  get name(): string {
    return this.props.name;
  }
  get keyHash(): string {
    return this.props.keyHash;
  }
  get prefix(): string {
    return this.props.prefix;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get lastUsedAt(): Date | null {
    return this.props.lastUsedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  markUsed(): void {
    this.props.lastUsedAt = new Date();
  }
}
