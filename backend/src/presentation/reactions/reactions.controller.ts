import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '@core/decorators';
import { JwtPayload } from '@core/interfaces';
import { EntityNotFoundException } from '@core/exceptions';
import { GetReactionsUseCase, ToggleReactionUseCase } from '@application/reactions/use-cases';
import { ToggleReactionDto } from '@application/reactions/dtos/toggle-reaction.dto';
import { GetReactionsQueryDto } from '@application/reactions/dtos/get-reactions.query.dto';
import { ReactionGroupResponseDto } from '@application/reactions/dtos/reaction-group.response.dto';

@ApiTags('Reactions')
@ApiBearerAuth('JWT-auth')
@Controller('reactions')
export class ReactionsController {
  constructor(
    private readonly getReactions: GetReactionsUseCase,
    private readonly toggleReaction: ToggleReactionUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Reactions on an entity, tallied per emoji' })
  async list(
    @AuthUser() auth: JwtPayload,
    @Query() query: GetReactionsQueryDto,
  ): Promise<ReactionGroupResponseDto[]> {
    const result = await this.getReactions.execute({
      tenantId: auth.tenantId,
      userId: auth.userId,
      targetType: query.targetType,
      targetId: query.targetId,
    });
    return result.getValue();
  }

  @Post('toggle')
  @ApiOperation({ summary: 'Toggle your reaction with one emoji on an entity' })
  async toggle(
    @AuthUser() auth: JwtPayload,
    @Body() dto: ToggleReactionDto,
  ): Promise<ReactionGroupResponseDto[]> {
    const result = await this.toggleReaction.execute({
      tenantId: auth.tenantId,
      userId: auth.userId,
      userName: auth.name,
      targetType: dto.targetType,
      targetId: dto.targetId,
      emoji: dto.emoji,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return result.getValue();
  }
}
