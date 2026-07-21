import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { ReactionTargetType } from '../domain/reaction-target-type.enum';

export class ToggleReactionDto {
  @ApiProperty({ enum: ReactionTargetType })
  @IsEnum(ReactionTargetType)
  targetType: ReactionTargetType;

  @ApiProperty({ description: 'Id of the bug/task/roadmap item' })
  @IsString()
  @MinLength(1)
  targetId: string;

  @ApiProperty({ description: 'One of the fixed reaction emojis' })
  @IsString()
  @MinLength(1)
  emoji: string;
}
