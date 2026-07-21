import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IReactionRepository } from '../repositories/reaction.repository';
import { ReactionEntity } from '../domain/entities/reaction.entity';
import { ReactionTargetType } from '../domain/reaction-target-type.enum';
import { isReactionEmoji } from '../domain/reaction-emoji';
import { ReactionGroupResponseDto } from '../dtos/reaction-group.response.dto';
import { ReactionMapper } from '../mappers/reaction.mapper';

export interface ToggleReactionRequest {
  tenantId: string;
  userId: string;
  userName: string;
  targetType: ReactionTargetType;
  targetId: string;
  emoji: string;
}

/**
 * Toggle the current user's reaction with one emoji on one target: remove it if
 * present, add it otherwise. Reactions are scoped by the authed tenant, so a user
 * can only ever read/write within their own workspace. Returns the target's full,
 * updated tallies so the caller can replace its cache.
 */
@Injectable()
export class ToggleReactionUseCase
  implements IUsecaseExecute<ToggleReactionRequest, Result<ReactionGroupResponseDto[]>>
{
  constructor(@Inject(IReactionRepository) private readonly reactions: IReactionRepository) {}

  async execute(req: ToggleReactionRequest): Promise<Result<ReactionGroupResponseDto[]>> {
    if (!isReactionEmoji(req.emoji)) return Result.fail('Unsupported reaction');

    const existing = await this.reactions.findOne(
      req.tenantId,
      req.targetType,
      req.targetId,
      req.emoji,
      req.userId,
    );

    if (existing) {
      await this.reactions.removeById(existing.id.toString());
    } else {
      const created = ReactionEntity.create({
        tenantId: req.tenantId,
        targetType: req.targetType,
        targetId: req.targetId,
        emoji: req.emoji,
        userId: req.userId,
        userName: req.userName,
      });
      if (created.isFailure) return Result.fail(created.error as string);
      await this.reactions.add(created.getValue());
    }

    const all = await this.reactions.findByTarget(req.tenantId, req.targetType, req.targetId);
    return Result.ok(ReactionMapper.toGroups(all, req.userId));
  }
}
