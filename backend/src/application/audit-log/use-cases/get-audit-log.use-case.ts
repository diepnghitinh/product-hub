import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { PaginationDto } from '@module-shared/modules/pagination/pagination.dto';
import {
  AuditLogPaginationResponse,
  IAuditLogRepository,
} from '../repositories/audit-log.repository';

export interface GetAuditLogRequest {
  tenantId: string;
  projectId: string;
  query: PaginationDto;
}

@Injectable()
export class GetAuditLogUseCase
  implements IUsecaseExecute<GetAuditLogRequest, Result<AuditLogPaginationResponse>>
{
  constructor(
    @Inject(IAuditLogRepository) private readonly audit: IAuditLogRepository,
  ) {}

  async execute({
    tenantId,
    projectId,
    query,
  }: GetAuditLogRequest): Promise<Result<AuditLogPaginationResponse>> {
    const result = await this.audit.findByProject(tenantId, projectId, query);
    return Result.ok(result);
  }
}
