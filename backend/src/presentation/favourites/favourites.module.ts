import { Module } from '@nestjs/common';
import { ApplicationFavouritesModule } from '@application/favourites/favourites.module';
import { FavouritesController } from './favourites.controller';

@Module({
  imports: [ApplicationFavouritesModule],
  controllers: [FavouritesController],
})
export class FavouritesPresentationModule {}
