import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { FavouriteRef } from '../domain/favourite.ref';

export interface GetFavouritesRequest {
  tenantId: string;
  userId: string;
}

/** Returns the user's pinned entities (stored newest-first on the user). */
@Injectable()
export class GetFavouritesUseCase
  implements IUsecaseExecute<GetFavouritesRequest, Result<FavouriteRef[]>>
{
  constructor(@Inject(IUserRepository) private readonly users: IUserRepository) {}

  async execute({ tenantId, userId }: GetFavouritesRequest): Promise<Result<FavouriteRef[]>> {
    const user = await this.users.findById(userId);
    if (!user || user.tenantId !== tenantId) return Result.fail('User not found');
    return Result.ok(user.favourites);
  }
}
