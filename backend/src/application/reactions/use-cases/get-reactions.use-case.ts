import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IReactionRepository } from '../repositories/reaction.repository';
import { ReactionTargetType } from '../domain/reaction-target-type.enum';
import { ReactionGroupResponseDto } from '../dtos/reaction-group.response.dto';
import { ReactionMapper } from '../mappers/reaction.mapper';

export interface GetReactionsRequest {
  tenantId: string;
  userId: string;
  targetType: ReactionTargetType;
  targetId: string;
}

/** Reactions on one target, folded into per-emoji tallies for the caller. */
@Injectable()
export class GetReactionsUseCase
  implements IUsecaseExecute<GetReactionsRequest, Result<ReactionGroupResponseDto[]>>
{
  constructor(@Inject(IReactionRepository) private readonly reactions: IReactionRepository) {}

  async execute({
    tenantId,
    userId,
    targetType,
    targetId,
  }: GetReactionsRequest): Promise<Result<ReactionGroupResponseDto[]>> {
    const all = await this.reactions.findByTarget(tenantId, targetType, targetId);
    return Result.ok(ReactionMapper.toGroups(all, userId));
  }
}
