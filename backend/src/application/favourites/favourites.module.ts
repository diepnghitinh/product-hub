import { Module } from '@nestjs/common';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
import { InfrastructureIssuesModule } from '@infrastructure/issues/issues.module';
import { InfrastructureRoadmapsModule } from '@infrastructure/roadmaps/roadmaps.module';
import {
  AddFavouriteUseCase,
  GetFavouritesUseCase,
  RemoveFavouriteUseCase,
} from './use-cases';

const useCases = [GetFavouritesUseCase, AddFavouriteUseCase, RemoveFavouriteUseCase];

@Module({
  // Favourites are stored on the user; the entity repos are used only to
  // validate + snapshot a pin at add-time.
  imports: [
    InfrastructureUsersModule,
    InfrastructureIssuesModule,
    InfrastructureRoadmapsModule,
  ],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationFavouritesModule {}
