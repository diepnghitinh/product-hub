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
      bugId?: string;
      taskId?: string;
      authorId: string;
      authorName: string;
      body: string;
      mentions?: string[];
      images?: string[];
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<CommentEntity> {
    const guard = Guard.againstNullOrUndefinedBulk([
      { argument: props.tenantId, argumentName: 'tenantId' },
      { argument: props.authorId, argumentName: 'authorId' },
    ]);
    if (!guard.succeeded) return Result.fail(guard.message);
    // A comment belongs to exactly one subject — a bug or a task.
    if (!props.bugId && !props.taskId) return Result.fail('bugId or taskId is required');
    // A comment needs *something*: text or at least one attachment. A dropped
    // screenshot or short clip can stand on its own, so an empty body is fine
    // as long as there's media.
    const body = (props.body ?? '').trim();
    const images = props.images ?? [];
    if (!body && images.length === 0) return Result.fail('A comment needs text or an attachment.');

    const createdAt = props.createdAt || new Date();
    return Result.ok(
      new CommentEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          bugId: props.bugId || '',
          taskId: props.taskId || '',
          authorId: props.authorId,
          authorName: props.authorName,
          body,
          mentions: Array.from(new Set(props.mentions ?? [])),
          images,
          createdAt,
          updatedAt: props.updatedAt || createdAt,
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
  get taskId(): string {
    return this.props.taskId;
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
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** Edit an existing comment's body/mentions (bumps updatedAt). */
  edit(fields: { body?: string; mentions?: string[]; images?: string[] }): Result<void> {
    const nextBody = fields.body !== undefined ? fields.body.trim() : this.props.body;
    const nextImages = fields.images !== undefined ? fields.images : this.props.images;
    // Same rule as creation: after the edit the comment must still carry text
    // or at least one attachment.
    if (!nextBody && nextImages.length === 0) {
      return Result.fail('A comment needs text or an attachment.');
    }
    if (fields.body !== undefined) this.props.body = nextBody;
    if (fields.mentions !== undefined) this.props.mentions = Array.from(new Set(fields.mentions));
    if (fields.images !== undefined) this.props.images = nextImages;
    this.props.updatedAt = new Date();
    return Result.ok();
  }
}
