import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { TenantProps } from './tenant.props';

/**
 * A Tenant is the top-level isolation boundary — every other aggregate belongs
 * to exactly one tenant. Created during registration alongside the first admin.
 */
export class TenantEntity extends AggregateRoot<TenantProps> {
  private constructor(props: TenantProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: { name: string; createdAt?: Date; updatedAt?: Date },
    id?: UniqueEntityID,
  ): Result<TenantEntity> {
    const guard = Guard.againstEmptyString(props.name, 'name');
    if (!guard.succeeded) return Result.fail(guard.message);

    const now = new Date();
    return Result.ok(
      new TenantEntity(
        {
          id: id || new UniqueEntityID(),
          name: props.name.trim(),
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
  get name(): string {
    return this.props.name;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  rename(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new Error('Tenant name cannot be empty');
    }
    this.props.name = name.trim();
    this.props.updatedAt = new Date();
  }
}
