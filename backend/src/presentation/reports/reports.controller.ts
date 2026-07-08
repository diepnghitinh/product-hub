import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { EntityNotFoundException } from '@core/exceptions';
import { AuditActor } from '@application/audit-log/domain/enums/audit.enums';
import {
  CreateReportUseCase,
  GetReportsUseCase,
  GetReportUseCase,
  UpdateReportUseCase,
  ReplaceSectionsUseCase,
  ReorderReportsUseCase,
  DeleteReportUseCase,
  ImportTestCasesUseCase,
  SetTestCaseResultUseCase,
  type ImportResult,
} from '@application/reports/use-cases';
import { CreateReportDto } from '@application/reports/dtos/create-report.dto';
import { UpdateReportDto } from '@application/reports/dtos/update-report.dto';
import { ReplaceSectionsDto } from '@application/reports/dtos/replace-sections.dto';
import { ReorderReportsDto } from '@application/reports/dtos/reorder-reports.dto';
import { ImportTestCasesDto } from '@application/reports/dtos/import-test-cases.dto';
import { SetResultDto } from '@application/reports/dtos/set-result.dto';
import { QueryReportDto } from '@application/reports/dtos/query-report.dto';
import { ReportResponseDto } from '@application/reports/dtos/report.response.dto';
import { ReportMapper } from '@application/reports/mappers';

@ApiTags('Reports')
@ApiBearerAuth('JWT-auth')
@Controller('projects/:projectId/reports')
export class ReportsController {
  constructor(
    private readonly createReport: CreateReportUseCase,
    private readonly getReports: GetReportsUseCase,
    private readonly getReport: GetReportUseCase,
    private readonly updateReport: UpdateReportUseCase,
    private readonly replaceSections: ReplaceSectionsUseCase,
    private readonly reorderReports: ReorderReportsUseCase,
    private readonly deleteReport: DeleteReportUseCase,
    private readonly importTestCases: ImportTestCasesUseCase,
    private readonly setResult: SetTestCaseResultUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List a project’s feature reports (ordered)' })
  async list(
    @AuthUser() auth: JwtPayload,
    @Param('projectId') projectId: string,
    @Query() query: QueryReportDto,
  ): Promise<ReportResponseDto[]> {
    const result = await this.getReports.execute({
      tenantId: auth.tenantId,
      projectId,
      groupId: query.groupId,
    });
    return ReportMapper.toResponseDtoArray(result.getValue());
  }

  @Post()
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Add a feature report' })
  async create(
    @AuthUser() auth: JwtPayload,
    @Param('projectId') projectId: string,
    @Body() dto: CreateReportDto,
  ): Promise<ReportResponseDto> {
    const result = await this.createReport.execute({
      tenantId: auth.tenantId,
      projectId,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return ReportMapper.toResponseDto(result.getValue());
  }

  @Post('reorder')
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Reorder feature reports' })
  async reorder(
    @AuthUser() auth: JwtPayload,
    @Param('projectId') projectId: string,
    @Body() dto: ReorderReportsDto,
  ): Promise<ReportResponseDto[]> {
    const result = await this.reorderReports.execute({
      tenantId: auth.tenantId,
      projectId,
      ids: dto.ids,
    });
    return ReportMapper.toResponseDtoArray(result.getValue());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a feature report (full document)' })
  async findOne(
    @AuthUser() auth: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<ReportResponseDto> {
    const result = await this.getReport.execute({ id, tenantId: auth.tenantId, projectId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return ReportMapper.toResponseDto(result.getValue());
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Update report meta (title/label/status/group…)' })
  async update(
    @AuthUser() auth: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateReportDto,
  ): Promise<ReportResponseDto> {
    const result = await this.updateReport.execute({
      id,
      tenantId: auth.tenantId,
      projectId,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return ReportMapper.toResponseDto(result.getValue());
  }

  @Put(':id/sections')
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Replace the report document body (auto-save)' })
  async putSections(
    @AuthUser() auth: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: ReplaceSectionsDto,
  ): Promise<ReportResponseDto> {
    const result = await this.replaceSections.execute({
      id,
      tenantId: auth.tenantId,
      projectId,
      sections: dto.sections,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return ReportMapper.toResponseDto(result.getValue());
  }

  @Post(':id/testcases/import')
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Import test cases (normalized xlsx/JSON rows)' })
  async import(
    @AuthUser() auth: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: ImportTestCasesDto,
  ): Promise<ImportResult> {
    const result = await this.importTestCases.execute({
      id,
      tenantId: auth.tenantId,
      projectId,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return result.getValue();
  }

  @Patch(':id/testcases/:shortId/result')
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Set a test case result (audited)' })
  async setCaseResult(
    @AuthUser() auth: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('shortId') shortId: string,
    @Body() dto: SetResultDto,
  ): Promise<ReportResponseDto> {
    const result = await this.setResult.execute({
      tenantId: auth.tenantId,
      projectId,
      shortId,
      result: dto.result,
      actor: { type: AuditActor.USER, id: auth.userId, name: auth.name },
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return ReportMapper.toResponseDto(result.getValue());
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a feature report (admin)' })
  async remove(
    @AuthUser() auth: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    const result = await this.deleteReport.execute({ id, tenantId: auth.tenantId, projectId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return { ok: true };
  }
}
