import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '@core/decorators';
import { JwtPayload } from '@core/interfaces';
import { EntityNotFoundException } from '@core/exceptions';
import {
  AddFavouriteUseCase,
  GetFavouritesUseCase,
  RemoveFavouriteUseCase,
} from '@application/favourites/use-cases';
import { AddFavouriteDto } from '@application/favourites/dtos/add-favourite.dto';
import { FavouriteResponseDto } from '@application/favourites/dtos/favourite.response.dto';
import { FavouriteMapper } from '@application/favourites/mappers/favourite.mapper';
import { FavouriteKind } from '@application/favourites/domain/favourite-kind.enum';

@ApiTags('Favourites')
@ApiBearerAuth('JWT-auth')
@Controller('favourites')
export class FavouritesController {
  constructor(
    private readonly getFavourites: GetFavouritesUseCase,
    private readonly addFavourite: AddFavouriteUseCase,
    private readonly removeFavourite: RemoveFavouriteUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Your pinned entities (sidebar favourites)' })
  async list(@AuthUser() auth: JwtPayload): Promise<FavouriteResponseDto[]> {
    const result = await this.getFavourites.execute({
      tenantId: auth.tenantId,
      userId: auth.userId,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return FavouriteMapper.toDtoArray(result.getValue());
  }

  @Post()
  @ApiOperation({ summary: 'Pin an entity' })
  async add(
    @AuthUser() auth: JwtPayload,
    @Body() dto: AddFavouriteDto,
  ): Promise<FavouriteResponseDto[]> {
    const result = await this.addFavourite.execute({
      tenantId: auth.tenantId,
      userId: auth.userId,
      kind: dto.kind,
      refId: dto.refId,
      roadmapId: dto.roadmapId,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return FavouriteMapper.toDtoArray(result.getValue());
  }

  @Delete(':kind/:refId')
  @ApiOperation({ summary: 'Unpin an entity' })
  async remove(
    @AuthUser() auth: JwtPayload,
    @Param('kind') kind: FavouriteKind,
    @Param('refId') refId: string,
  ): Promise<FavouriteResponseDto[]> {
    const result = await this.removeFavourite.execute({
      tenantId: auth.tenantId,
      userId: auth.userId,
      kind,
      refId,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return FavouriteMapper.toDtoArray(result.getValue());
  }
}
