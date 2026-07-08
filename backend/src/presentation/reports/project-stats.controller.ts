import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '@core/decorators';
import { JwtPayload } from '@core/interfaces';
import { GetProjectStatsUseCase } from '@application/reports/use-cases';
import { ProjectStatsResponseDto } from '@application/reports/dtos/project-stats.response.dto';

@ApiTags('Reports')
@ApiBearerAuth('JWT-auth')
@Controller('project-stats')
export class ProjectStatsController {
  constructor(private readonly getStats: GetProjectStatsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Batch report rollups for the given project ids' })
  async stats(
    @AuthUser() auth: JwtPayload,
    @Query('ids') ids?: string,
  ): Promise<ProjectStatsResponseDto[]> {
    const projectIds = (ids ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const result = await this.getStats.execute({ tenantId: auth.tenantId, projectIds });
    return result.getValue().map((s) => ({
      projectId: s.projectId,
      reportsTotal: s.total,
      reportsDone: s.done,
      reportsTesting: s.testing,
      reportsInfo: s.info,
      progress: s.total > 0 ? Math.round((s.done / s.total) * 100) : 0,
    }));
  }
}
