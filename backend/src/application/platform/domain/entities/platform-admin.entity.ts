import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { PlatformAdminProps } from './platform-admin.props';

/**
 * The vendor's own operator — the person who runs product-hub as a SaaS, not a
 * member of any workspace.
 *
 * Deliberately a separate aggregate from {@link UserEntity} rather than a flag on
 * it: a platform admin has no `tenantId`, so every tenant-scoped read in the app
 * would have to special-case them. Keeping them out of `users` means a compromised
 * workspace account can never be escalated into platform access, and the tenant
 * API can never accidentally return one.
 */
export class PlatformAdminEntity extends AggregateRoot<PlatformAdminProps> {
  private constructor(props: PlatformAdminProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      email: string;
      name: string;
      passwordHash: string;
      isActive?: boolean;
      lastLoginAt?: Date | null;
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<PlatformAdminEntity> {
    const guard = Guard.againstNullOrUndefinedBulk([
      { argument: props.email, argumentName: 'email' },
      { argument: props.passwordHash, argumentName: 'passwordHash' },
    ]);
    if (!guard.succeeded) return Result.fail(guard.message);

    const nameGuard = Guard.againstEmptyString(props.name, 'name');
    if (!nameGuard.succeeded) return Result.fail(nameGuard.message);

    const now = new Date();
    return Result.ok(
      new PlatformAdminEntity(
        {
          id: id || new UniqueEntityID(),
          email: props.email.trim().toLowerCase(),
          name: props.name.trim(),
          passwordHash: props.passwordHash,
          isActive: props.isActive ?? true,
          lastLoginAt: props.lastLoginAt ?? null,
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
  get email(): string {
    return this.props.email;
  }
  get name(): string {
    return this.props.name;
  }
  get passwordHash(): string {
    return this.props.passwordHash;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  get lastLoginAt(): Date | null {
    return this.props.lastLoginAt ?? null;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  recordLogin(): void {
    this.props.lastLoginAt = new Date();
    this.touch();
  }

  changePassword(passwordHash: string): void {
    this.props.passwordHash = passwordHash;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
