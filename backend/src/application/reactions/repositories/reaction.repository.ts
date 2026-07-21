import { ReactionEntity } from '../domain/entities/reaction.entity';
import { ReactionTargetType } from '../domain/reaction-target-type.enum';

/** Port for reaction persistence. All reads are tenant-scoped. */
export abstract class IReactionRepository {
  /** All reactions on one target, oldest first. */
  findByTarget: (
    tenantId: string,
    targetType: ReactionTargetType,
    targetId: string,
  ) => Promise<ReactionEntity[]>;
  /** A specific user's specific-emoji reaction on a target (drives toggling). */
  findOne: (
    tenantId: string,
    targetType: ReactionTargetType,
    targetId: string,
    emoji: string,
    userId: string,
  ) => Promise<ReactionEntity | null>;
  add: (reaction: ReactionEntity) => Promise<void>;
  removeById: (id: string) => Promise<void>;
}
