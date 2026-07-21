import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FavouriteKind } from '../domain/favourite-kind.enum';

/** A pinned entity as returned to the client (flat). */
export class FavouriteResponseDto {
  @ApiProperty({ enum: FavouriteKind })
  kind: FavouriteKind;

  @ApiProperty({ description: 'Id of the referenced entity' })
  refId: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ description: 'Owning roadmap id (roadmap items only)' })
  roadmapId?: string;

  @ApiPropertyOptional({ description: 'Owning team id (team-scoped bugs/tasks)' })
  teamId?: string;

  @ApiProperty()
  createdAt: Date;
}
