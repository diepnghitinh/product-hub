import { Body, Controller, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Public } from '@core/decorators';
import { EntityNotFoundException } from '@core/exceptions';
import { AuditActor } from '@application/audit-log/domain/enums/audit.enums';
import { SetTestCaseResultUseCase } from '@application/reports/use-cases';
import { SetResultDto } from '@application/reports/dtos/set-result.dto';
import { ReportResponseDto } from '@application/reports/dtos/report.response.dto';
import { ReportMapper } from '@application/reports/mappers';
import { ApiAuth, ApiKeyGuard } from '@presentation/api-keys/api-key.guard';

/**
 * Public test-case API — authenticated by an `x-api-key` header (not JWT). Lets
 * CI/external tooling set a test case's result. Every change is audited as an
 * `api` actor.
 */
@ApiTags('Public API')
@ApiSecurity('api-key')
@Public()
@UseGuards(ApiKeyGuard)
@Controller('public/testcases')
export class PublicTestcasesController {
  constructor(private readonly setResult: SetTestCaseResultUseCase) {}

  @Patch(':projectId/:shortId')
  @ApiOperation({ summary: 'Set a test case result by shortId (API key)' })
  async set(
    @Req() req: { apiAuth: ApiAuth },
    @Param('projectId') projectId: string,
    @Param('shortId') shortId: string,
    @Body() dto: SetResultDto,
  ): Promise<ReportResponseDto> {
    const { tenantId, name } = req.apiAuth;
    const result = await this.setResult.execute({
      tenantId,
      projectId,
      shortId,
      result: dto.result,
      actor: { type: AuditActor.API, id: 'api', name },
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return ReportMapper.toResponseDto(result.getValue());
  }
}
