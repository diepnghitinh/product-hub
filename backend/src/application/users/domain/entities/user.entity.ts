import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Role } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { FavouriteKind } from '@application/favourites/domain/favourite-kind.enum';
import { FavouriteRef } from '@application/favourites/domain/favourite.ref';
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
      favourites?: FavouriteRef[];
      readInboxKeys?: string[];
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
          favourites: props.favourites ?? [],
          readInboxKeys: props.readInboxKeys ?? [],
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
  get favourites(): FavouriteRef[] {
    return this.props.favourites;
  }
  get readInboxKeys(): string[] {
    return this.props.readInboxKeys;
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

  /**
   * Mark inbox notifications read by their key (see GetInboxUseCase for the key
   * format). Idempotent and de-duped; the list is bounded to the most recent
   * 1000 keys so it can never grow without limit.
   */
  markInboxItemsRead(keys: string[]): void {
    if (keys.length === 0) return;
    const merged = Array.from(new Set([...this.props.readInboxKeys, ...keys]));
    this.props.readInboxKeys =
      merged.length > 1000 ? merged.slice(merged.length - 1000) : merged;
    this.touch();
  }

  isInboxItemRead(key: string): boolean {
    return this.props.readInboxKeys.includes(key);
  }

  /**
   * Pin an entity to the sidebar. Idempotent and de-duped by (kind, refId) —
   * re-favouriting an already-pinned item is a no-op, not a duplicate. Newest
   * pins go to the front so the sidebar reads most-recent-first.
   */
  addFavourite(ref: FavouriteRef): void {
    const exists = this.props.favourites.some(
      (f) => f.kind === ref.kind && f.refId === ref.refId,
    );
    if (exists) return;
    this.props.favourites = [ref, ...this.props.favourites];
    this.touch();
  }

  /** Unpin an entity. A no-op if it wasn't pinned. */
  removeFavourite(kind: FavouriteKind, refId: string): void {
    const next = this.props.favourites.filter(
      (f) => !(f.kind === kind && f.refId === refId),
    );
    if (next.length === this.props.favourites.length) return;
    this.props.favourites = next;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
