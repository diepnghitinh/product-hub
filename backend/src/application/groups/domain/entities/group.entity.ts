import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { GroupProps } from './group.props';

/**
 * A Group is a titled, ordered section in a project's sidebar that holds feature
 * reports. `(tenantId, projectId, slug)` is unique.
 */
export class GroupEntity extends AggregateRoot<GroupProps> {
  private constructor(props: GroupProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      projectId: string;
      slug: string;
      title: string;
      order?: number;
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<GroupEntity> {
    const guard = Guard.againstNullOrUndefinedBulk([
      { argument: props.tenantId, argumentName: 'tenantId' },
      { argument: props.projectId, argumentName: 'projectId' },
      { argument: props.slug, argumentName: 'slug' },
    ]);
    if (!guard.succeeded) return Result.fail(guard.message);

    const titleGuard = Guard.againstEmptyString(props.title, 'title');
    if (!titleGuard.succeeded) return Result.fail(titleGuard.message);

    const now = new Date();
    return Result.ok(
      new GroupEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          projectId: props.projectId,
          slug: props.slug,
          title: props.title.trim(),
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
  get projectId(): string {
    return this.props.projectId;
  }
  get slug(): string {
    return this.props.slug;
  }
  get title(): string {
    return this.props.title;
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

  rename(title: string): void {
    if (!title || title.trim().length === 0) {
      throw new Error('title cannot be empty');
    }
    this.props.title = title.trim();
    this.touch();
  }

  setOrder(order: number): void {
    this.props.order = order;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
