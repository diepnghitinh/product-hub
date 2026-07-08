import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '@core/decorators';
import { JwtPayload } from '@core/interfaces';
import { IServiceListResponse, ServiceResponse } from '@core/helpers';
import { PaginationDto } from '@module-shared/modules/pagination/pagination.dto';
import { GetAuditLogUseCase } from '@application/audit-log/use-cases';
import { AuditLogResponseDto } from '@application/audit-log/dtos/audit-log.response.dto';
import { AuditLogMapper } from '@application/audit-log/mappers';

@ApiTags('Audit log')
@ApiBearerAuth('JWT-auth')
@Controller('projects/:projectId/audit-log')
export class AuditLogController {
  constructor(private readonly getAuditLog: GetAuditLogUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Project change history (test-case / report edits)' })
  async list(
    @AuthUser() auth: JwtPayload,
    @Param('projectId') projectId: string,
    @Query() query: PaginationDto,
  ): Promise<IServiceListResponse<AuditLogResponseDto>> {
    const result = await this.getAuditLog.execute({
      tenantId: auth.tenantId,
      projectId,
      query,
    });
    const { data, total, page, limit } = result.getValue();
    return ServiceResponse.paginate(
      AuditLogMapper.toResponseDtoArray(data),
      total,
      page,
      limit,
    );
  }
}
