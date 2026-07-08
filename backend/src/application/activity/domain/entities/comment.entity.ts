import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { CommentProps } from './comment.props';

/** A comment in a bug's activity thread. */
export class CommentEntity extends AggregateRoot<CommentProps> {
  private constructor(props: CommentProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      bugId: string;
      authorId: string;
      authorName: string;
      body: string;
      mentions?: string[];
      images?: string[];
      createdAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<CommentEntity> {
    const guard = Guard.againstNullOrUndefinedBulk([
      { argument: props.tenantId, argumentName: 'tenantId' },
      { argument: props.bugId, argumentName: 'bugId' },
      { argument: props.authorId, argumentName: 'authorId' },
    ]);
    if (!guard.succeeded) return Result.fail(guard.message);
    const bodyGuard = Guard.againstEmptyString(props.body, 'body');
    if (!bodyGuard.succeeded) return Result.fail(bodyGuard.message);

    return Result.ok(
      new CommentEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          bugId: props.bugId,
          authorId: props.authorId,
          authorName: props.authorName,
          body: props.body.trim(),
          mentions: Array.from(new Set(props.mentions ?? [])),
          images: props.images ?? [],
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
  get bugId(): string {
    return this.props.bugId;
  }
  get authorId(): string {
    return this.props.authorId;
  }
  get authorName(): string {
    return this.props.authorName;
  }
  get body(): string {
    return this.props.body;
  }
  get mentions(): string[] {
    return this.props.mentions;
  }
  get images(): string[] {
    return this.props.images;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
