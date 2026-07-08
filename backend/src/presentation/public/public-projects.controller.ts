import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@core/decorators';
import { EntityNotFoundException } from '@core/exceptions';
import { GetPublicProjectUseCase } from '@application/projects/use-cases';
import { ProjectMapper } from '@application/projects/mappers';
import { ProjectResponseDto } from '@application/projects/dtos/project.response.dto';
import { ReportMapper } from '@application/reports/mappers';
import { ReportResponseDto } from '@application/reports/dtos/report.response.dto';

interface PublicProjectView {
  project: ProjectResponseDto;
  reports: ReportResponseDto[];
}

/** Public read-only project view (no auth) resolved from a share token. */
@ApiTags('Public API')
@Public()
@Controller('public/projects')
export class PublicProjectsController {
  constructor(private readonly getPublic: GetPublicProjectUseCase) {}

  @Get(':token')
  @ApiOperation({ summary: 'Read-only project by share token' })
  async view(@Param('token') token: string): Promise<PublicProjectView> {
    const result = await this.getPublic.execute({ token });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    const { project, reports } = result.getValue();
    return {
      project: ProjectMapper.toResponseDto(project),
      reports: ReportMapper.toResponseDtoArray(reports),
    };
  }
}
