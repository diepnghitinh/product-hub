import { FavouriteRef } from '../domain/favourite.ref';
import { FavouriteResponseDto } from '../dtos/favourite.response.dto';

export class FavouriteMapper {
  static toDto(ref: FavouriteRef): FavouriteResponseDto {
    return {
      kind: ref.kind,
      refId: ref.refId,
      title: ref.title,
      roadmapId: ref.roadmapId,
      teamId: ref.teamId,
      createdAt: ref.createdAt,
    };
  }

  static toDtoArray(refs: FavouriteRef[]): FavouriteResponseDto[] {
    return refs.map((r) => this.toDto(r));
  }
}
