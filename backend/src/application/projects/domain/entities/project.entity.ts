import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { Environment } from '../enums/environment.enum';
import { ProjectProps } from './project.props';

/**
 * A Project is a workspace that groups feature reports. It belongs to exactly one
 * tenant, is owned by its creator, can be shared with members, tagged by
 * environment, pinned to the top of the Dashboard, and soft-deleted (archived).
 */
export class ProjectEntity extends AggregateRoot<ProjectProps> {
  private constructor(props: ProjectProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      slug: string;
      title: string;
      subtitle?: string;
      owner?: string;
      createdBy: string;
      sharedWith?: string[];
      pinned?: boolean;
      environment?: Environment;
      publicEnabled?: boolean;
      publicToken?: string | null;
      deletedAt?: Date | null;
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<ProjectEntity> {
    const guard = Guard.againstNullOrUndefinedBulk([
      { argument: props.tenantId, argumentName: 'tenantId' },
      { argument: props.createdBy, argumentName: 'createdBy' },
      { argument: props.slug, argumentName: 'slug' },
    ]);
    if (!guard.succeeded) return Result.fail(guard.message);

    const titleGuard = Guard.againstEmptyString(props.title, 'title');
    if (!titleGuard.succeeded) return Result.fail(titleGuard.message);

    const now = new Date();
    return Result.ok(
      new ProjectEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          slug: props.slug,
          title: props.title.trim(),
          subtitle: props.subtitle?.trim() || '',
          owner: props.owner?.trim() || '',
          createdBy: props.createdBy,
          sharedWith: props.sharedWith ?? [],
          pinned: props.pinned ?? false,
          environment: props.environment ?? Environment.DEVELOPMENT,
          publicEnabled: props.publicEnabled ?? false,
          publicToken: props.publicToken ?? null,
          deletedAt: props.deletedAt ?? null,
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
  get slug(): string {
    return this.props.slug;
  }
  get title(): string {
    return this.props.title;
  }
  get subtitle(): string {
    return this.props.subtitle;
  }
  get owner(): string {
    return this.props.owner;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get sharedWith(): string[] {
    return this.props.sharedWith;
  }
  get pinned(): boolean {
    return this.props.pinned;
  }
  get environment(): Environment {
    return this.props.environment;
  }
  get publicEnabled(): boolean {
    return this.props.publicEnabled;
  }
  get publicToken(): string | null {
    return this.props.publicToken;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }
  get isArchived(): boolean {
    return this.props.deletedAt !== null;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  rename(title: string): void {
    if (!title || title.trim().length === 0) {
      throw new Error('title cannot be empty');
    }
    this.props.title = title.trim();
    this.touch();
  }

  setSubtitle(subtitle: string): void {
    this.props.subtitle = subtitle.trim();
    this.touch();
  }

  setOwner(owner: string): void {
    this.props.owner = owner.trim();
    this.touch();
  }

  setSlug(slug: string): void {
    this.props.slug = slug;
    this.touch();
  }

  setEnvironment(environment: Environment): void {
    this.props.environment = environment;
    this.touch();
  }

  setPinned(pinned: boolean): void {
    this.props.pinned = pinned;
    this.touch();
  }

  shareWith(userIds: string[]): void {
    this.props.sharedWith = Array.from(new Set(userIds));
    this.touch();
  }

  enableSharing(token: string): void {
    this.props.publicEnabled = true;
    this.props.publicToken = token;
    this.touch();
  }

  disableSharing(): void {
    this.props.publicEnabled = false;
    this.props.publicToken = null;
    this.touch();
  }

  archive(): void {
    if (this.props.deletedAt) return;
    this.props.deletedAt = new Date();
    this.touch();
  }

  restore(): void {
    this.props.deletedAt = null;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
