import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { ReactionTargetType } from '../reaction-target-type.enum';
import { isReactionEmoji } from '../reaction-emoji';
import { ReactionProps } from './reaction.props';

/** One user's single-emoji reaction to one entity. */
export class ReactionEntity extends AggregateRoot<ReactionProps> {
  private constructor(props: ReactionProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      targetType: ReactionTargetType;
      targetId: string;
      emoji: string;
      userId: string;
      userName: string;
      createdAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<ReactionEntity> {
    const guard = Guard.againstNullOrUndefinedBulk([
      { argument: props.tenantId, argumentName: 'tenantId' },
      { argument: props.targetId, argumentName: 'targetId' },
      { argument: props.userId, argumentName: 'userId' },
    ]);
    if (!guard.succeeded) return Result.fail(guard.message);
    // Only the fixed palette is allowed — the bar is not a free emoji picker.
    if (!isReactionEmoji(props.emoji)) return Result.fail('Unsupported reaction');

    return Result.ok(
      new ReactionEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          targetType: props.targetType,
          targetId: props.targetId,
          emoji: props.emoji,
          userId: props.userId,
          userName: props.userName ?? '',
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
  get targetType(): ReactionTargetType {
    return this.props.targetType;
  }
  get targetId(): string {
    return this.props.targetId;
  }
  get emoji(): string {
    return this.props.emoji;
  }
  get userId(): string {
    return this.props.userId;
  }
  get userName(): string {
    return this.props.userName;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
