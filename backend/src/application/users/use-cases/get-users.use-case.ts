import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { QueryUserDto } from '../dtos/query-user.dto';
import {
  IUserRepository,
  UserPaginationResponse,
} from '../repositories/user.repository';

export interface GetUsersRequest {
  tenantId: string;
  query: QueryUserDto;
}

@Injectable()
export class GetUsersUseCase
  implements IUsecaseExecute<GetUsersRequest, Result<UserPaginationResponse>>
{
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
  ) {}

  async execute({
    tenantId,
    query,
  }: GetUsersRequest): Promise<Result<UserPaginationResponse>> {
    const result = await this.users.findByTenant(tenantId, query);
    return Result.ok(result);
  }
}
