import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { TENANT_STATUSES, TenantProps, TenantStatus } from './tenant.props';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * A Tenant is the top-level isolation boundary — every other aggregate belongs
 * to exactly one tenant. Created during registration alongside the first admin,
 * and administered afterwards from the platform console.
 */
export class TenantEntity extends AggregateRoot<TenantProps> {
  private constructor(props: TenantProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      name: string;
      slug?: string | null;
      status?: TenantStatus;
      contactEmail?: string | null;
      notes?: string | null;
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<TenantEntity> {
    const guard = Guard.againstEmptyString(props.name, 'name');
    if (!guard.succeeded) return Result.fail(guard.message);

    const slug = props.slug?.trim().toLowerCase() || null;
    if (slug && !SLUG_PATTERN.test(slug)) {
      return Result.fail('slug may only contain lowercase letters, numbers and dashes');
    }

    // Rows written before tenants had a status read back as undefined; treat
    // them as active rather than failing the guard.
    const status = props.status ?? TenantStatus.ACTIVE;
    const statusGuard = Guard.isOneOf(status, TENANT_STATUSES, 'status');
    if (!statusGuard.succeeded) return Result.fail(statusGuard.message);

    const now = new Date();
    return Result.ok(
      new TenantEntity(
        {
          id: id || new UniqueEntityID(),
          name: props.name.trim(),
          slug,
          status,
          contactEmail: props.contactEmail?.trim().toLowerCase() || null,
          notes: props.notes?.trim() || null,
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
  get slug(): string | null {
    return this.props.slug ?? null;
  }
  get status(): TenantStatus {
    return this.props.status;
  }
  get isSuspended(): boolean {
    return this.props.status === TenantStatus.SUSPENDED;
  }
  get contactEmail(): string | null {
    return this.props.contactEmail ?? null;
  }
  get notes(): string | null {
    return this.props.notes ?? null;
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
    this.touch();
  }

  update(patch: {
    name?: string;
    slug?: string | null;
    contactEmail?: string | null;
    notes?: string | null;
  }): Result<void> {
    if (patch.name !== undefined) {
      const guard = Guard.againstEmptyString(patch.name, 'name');
      if (!guard.succeeded) return Result.fail(guard.message);
      this.props.name = patch.name.trim();
    }
    if (patch.slug !== undefined) {
      const slug = patch.slug?.trim().toLowerCase() || null;
      if (slug && !SLUG_PATTERN.test(slug)) {
        return Result.fail('slug may only contain lowercase letters, numbers and dashes');
      }
      this.props.slug = slug;
    }
    if (patch.contactEmail !== undefined) {
      this.props.contactEmail = patch.contactEmail?.trim().toLowerCase() || null;
    }
    if (patch.notes !== undefined) {
      this.props.notes = patch.notes?.trim() || null;
    }
    this.touch();
    return Result.ok();
  }

  suspend(): void {
    this.props.status = TenantStatus.SUSPENDED;
    this.touch();
  }

  activate(): void {
    this.props.status = TenantStatus.ACTIVE;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
