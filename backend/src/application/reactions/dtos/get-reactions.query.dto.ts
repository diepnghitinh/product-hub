import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { ReactionTargetType } from '../domain/reaction-target-type.enum';

export class GetReactionsQueryDto {
  @ApiProperty({ enum: ReactionTargetType })
  @IsEnum(ReactionTargetType)
  targetType: ReactionTargetType;

  @ApiProperty({ description: 'Id of the bug/task/roadmap item' })
  @IsString()
  @MinLength(1)
  targetId: string;
}
