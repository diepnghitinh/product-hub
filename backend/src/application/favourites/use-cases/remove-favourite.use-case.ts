import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { FavouriteKind } from '../domain/favourite-kind.enum';
import { FavouriteRef } from '../domain/favourite.ref';

export interface RemoveFavouriteRequest {
  tenantId: string;
  userId: string;
  kind: FavouriteKind;
  refId: string;
}

/** Unpins an entity and returns the updated favourites list. Idempotent. */
@Injectable()
export class RemoveFavouriteUseCase
  implements IUsecaseExecute<RemoveFavouriteRequest, Result<FavouriteRef[]>>
{
  constructor(@Inject(IUserRepository) private readonly users: IUserRepository) {}

  async execute({
    tenantId,
    userId,
    kind,
    refId,
  }: RemoveFavouriteRequest): Promise<Result<FavouriteRef[]>> {
    const user = await this.users.findById(userId);
    if (!user || user.tenantId !== tenantId) return Result.fail('User not found');
    user.removeFavourite(kind, refId);
    await this.users.update(user);
    return Result.ok(user.favourites);
  }
}
