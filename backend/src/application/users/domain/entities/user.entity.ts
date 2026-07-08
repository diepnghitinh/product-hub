import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Role } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { UserProps } from './user.props';

/**
 * A User account within a tenant. Passwords are only ever stored/compared as a
 * bcrypt hash (hashing happens in a use-case; the entity just holds the hash).
 */
export class UserEntity extends AggregateRoot<UserProps> {
  private constructor(props: UserProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      email: string;
      name: string;
      passwordHash: string;
      role?: Role;
      inboxSeenAt?: Date | null;
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<UserEntity> {
    const guard = Guard.againstNullOrUndefinedBulk([
      { argument: props.tenantId, argumentName: 'tenantId' },
      { argument: props.email, argumentName: 'email' },
      { argument: props.name, argumentName: 'name' },
      { argument: props.passwordHash, argumentName: 'passwordHash' },
    ]);
    if (!guard.succeeded) return Result.fail(guard.message);

    const email = props.email.trim().toLowerCase();
    if (!email.includes('@')) return Result.fail('email is invalid');
    if (props.name.trim().length === 0) return Result.fail('name cannot be empty');

    const now = new Date();
    return Result.ok(
      new UserEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          email,
          name: props.name.trim(),
          passwordHash: props.passwordHash,
          role: props.role || Role.TESTER,
          inboxSeenAt: props.inboxSeenAt ?? null,
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
  get email(): string {
    return this.props.email;
  }
  get name(): string {
    return this.props.name;
  }
  get passwordHash(): string {
    return this.props.passwordHash;
  }
  get role(): Role {
    return this.props.role;
  }
  get inboxSeenAt(): Date | null | undefined {
    return this.props.inboxSeenAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  updateName(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new Error('name cannot be empty');
    }
    this.props.name = name.trim();
    this.touch();
  }

  updateRole(role: Role): void {
    this.props.role = role;
    this.touch();
  }

  changePassword(passwordHash: string): void {
    this.props.passwordHash = passwordHash;
    this.touch();
  }

  markInboxSeen(): void {
    this.props.inboxSeenAt = new Date();
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
