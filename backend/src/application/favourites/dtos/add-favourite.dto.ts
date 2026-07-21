import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { FavouriteKind } from '../domain/favourite-kind.enum';

export class AddFavouriteDto {
  @ApiProperty({ enum: FavouriteKind })
  @IsEnum(FavouriteKind)
  kind: FavouriteKind;

  @ApiProperty({ description: 'Id of the entity to pin (bug/task id, or roadmap item id)' })
  @IsString()
  @MinLength(1)
  refId: string;

  @ApiPropertyOptional({ description: 'Owning roadmap id — required when kind is roadmap-item' })
  @IsOptional()
  @IsString()
  roadmapId?: string;
}
