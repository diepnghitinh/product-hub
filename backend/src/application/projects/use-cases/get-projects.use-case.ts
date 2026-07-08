import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { QueryProjectDto } from '../dtos/query-project.dto';
import {
  IProjectRepository,
  ProjectPaginationResponse,
} from '../repositories/project.repository';

export interface GetProjectsRequest {
  tenantId: string;
  query: QueryProjectDto;
}

@Injectable()
export class GetProjectsUseCase
  implements IUsecaseExecute<GetProjectsRequest, Result<ProjectPaginationResponse>>
{
  constructor(
    @Inject(IProjectRepository) private readonly projects: IProjectRepository,
  ) {}

  async execute({
    tenantId,
    query,
  }: GetProjectsRequest): Promise<Result<ProjectPaginationResponse>> {
    const result = await this.projects.findByTenant(tenantId, query);
    return Result.ok(result);
  }
}
